import { liveScoreDiscrepancy, describeDiscrepancy } from "@/lib/liga/live-discrepancy";
import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";
import { resolveSheetLocation } from "@/lib/liga/sheet-location";

// Data/hora atual em Lisboa como "YYYY-MM-DD HH:MM" (comparável por texto)
function nowLisbon(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" }).slice(0, 16);
}

// Jogo já terminou? (início + 2h; sem hora conhecida, só no dia seguinte)
function gameIsOver(date: string, time: string | null, now: string): boolean {
  if (!time) return date < now.slice(0, 10);
  const [h, m] = time.split(":").map(Number);
  const end = h * 60 + (m || 0) + 120;
  const endDate = end >= 1440
    ? new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + 1)).toISOString().slice(0, 10)
    : date;
  const em = end % 1440;
  return `${endDate} ${String(Math.floor(em / 60)).padStart(2, "0")}:${String(em % 60).padStart(2, "0")}` <= now;
}

export async function GET(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = await createUnscopedAdminClient();

  const { data: competition } = await adminClient
    .from("competitions")
    .select("id, competition_key, season_id")
    // ?competition=taca → Taça da Liga INATEL; por omissão a Liga INATEL (nunca misturadas)
    .eq("slug", new URL(req.url).searchParams.get("competition") === "taca" ? "taca-liga-inatel" : "liga-inatel")
    .single();

  if (!competition?.season_id) {
    return NextResponse.json({ games: [] });
  }

  const [eventsRes, resultsRes, submissionsRes, publishedNewsRes] = await Promise.all([
    adminClient
      .from("events")
      .select("id, event_date, event_time, location, description, opponent, original_scheduled_at")
      .eq("type", "jogo")
      .eq("competition", competition.competition_key ?? "Liga")
      .eq("season_id", competition.season_id)
      .is("deleted_at", null)
      .order("event_date"),
    adminClient.from("league_game_results").select("*"),
    adminClient
      .from("result_submissions")
      .select("id, event_id, status, home_team_name, away_team_name, home_score, away_score, submitted_by_name, submitted_by_team, submitted_at, notes, import_id, photo_url")
      .order("submitted_at", { ascending: false }),
    // Notícias publicadas por jogo (jogo só deixa de estar pendente com resultado ou notícia)
    adminClient.from("news").select("game_id").eq("is_published", true).not("game_id", "is", null),
  ]);

  // Sessões live finalizadas por jogo (uma por clube): deteta registos divergentes entre as duas equipas
  const eventIds = (eventsRes.data ?? []).map((e: { id: string }) => e.id);
  const { data: liveRows } = eventIds.length
    ? await adminClient.from("game_sessions")
        .select("event_id, club_id, home_score, away_score, created_at")
        .in("event_id", eventIds).eq("status", "finished").not("club_id", "is", null)
        .order("created_at", { ascending: true })
    : { data: [] as { event_id: string; club_id: string; home_score: number; away_score: number }[] };
  const liveClubIds = [...new Set((liveRows ?? []).map((r) => r.club_id as string))];
  const { data: liveClubs } = liveClubIds.length
    ? await adminClient.from("clubs").select("id, name, league_team_id").in("id", liveClubIds)
    : { data: [] as { id: string; name: string; league_team_id: string | null }[] };
  const clubLabel = new Map((liveClubs ?? []).map((c) => [c.id as string, c.name as string]));
  const discrepancyByEvent = new Map<string, string>();
  const liveByEvent = new Map<string, { teamName: string; own: number; opp: number }[]>();
  for (const r of liveRows ?? []) {
    const list = liveByEvent.get(r.event_id as string) ?? [];
    list.push({ teamName: clubLabel.get(r.club_id as string) ?? "Equipa", own: r.home_score as number, opp: r.away_score as number });
    liveByEvent.set(r.event_id as string, list);
  }
  for (const [eid, list] of liveByEvent) {
    const d = liveScoreDiscrepancy(list);
    if (d) discrepancyByEvent.set(eid, describeDiscrepancy(d));
  }

  const now = nowLisbon();
  const publishedNews = new Set((publishedNewsRes.data ?? []).map((r: { game_id: string }) => r.game_id));

  const resultMap = new Map((resultsRes.data ?? []).map((r: { event_id: string }) => [r.event_id, r]));
  // O caminho da folha de jogo não sai do servidor: só o tipo (abre via /submissions/[id]/sheet)
  const subsByEvent = (submissionsRes.data ?? []).reduce((acc: Record<string, unknown[]>, s: { event_id: string; photo_url?: string | null }) => {
    const { photo_url, ...rest } = s;
    (acc[s.event_id] ??= []).push({ ...rest, sheet_kind: resolveSheetLocation(photo_url)?.kind ?? null });
    return acc;
  }, {} as Record<string, unknown[]>);

  const ourTeamRes = await adminClient
    .from("league_teams")
    .select("name")
    .eq("is_our_team", true)
    .single();
  const ourTeam = ourTeamRes.data?.name ?? "";

  const games = (eventsRes.data ?? []).map((e: {
    id: string; event_date: string; event_time: string | null;
    location: string | null; description: string | null; opponent: string | null;
    original_scheduled_at: string | null;
  }) => {
    const meta = parseGameMeta(e.description ?? null);
    const result = resultMap.get(e.id) ?? null;
    const subs = (subsByEvent[e.id] ?? []) as unknown[];
    const pendingCount = (subs as Array<{status: string}>).filter(s => s.status === "pending").length;

    // Ação pendente do Master admin: jogo já terminado, sem resultado confirmado e sem notícia publicada
    const pendingActions: string[] = [];
    if (!result && !publishedNews.has(e.id) && gameIsOver(e.event_date, e.event_time, now)) pendingActions.push("no_result");
    const liveDiscrepancy = discrepancyByEvent.get(e.id) ?? null;
    if (liveDiscrepancy) pendingActions.push("live_score_mismatch");

    return {
      id: e.id,
      event_date: e.event_date,
      event_time: e.event_time,
      location: e.location,
      home_team: meta?.home_team ?? ourTeam,
      away_team: meta?.away_team ?? (e.opponent ?? "Adversário"),
      jornada: meta?.jornada ?? null,
      volta: meta?.volta ?? null,
      serie: meta?.serie ?? null,
      original_scheduled_at: e.original_scheduled_at ?? null,
      result: result ? { home_score: (result as unknown as {home_score: number}).home_score, away_score: (result as unknown as {away_score: number}).away_score } : null,
      result_id: result ? (result as unknown as {id: string}).id : null,
      result_status: result ? "approved" : pendingCount > 0 ? "pending" : "no_result",
      pending_count: pendingCount,
      pending_actions: pendingActions,
      live_discrepancy: liveDiscrepancy,
      submissions: subs,
    };
  });

  return NextResponse.json({ games, competition_id: competition.id });
}
