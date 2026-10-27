import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";

export async function GET() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = await createAdminClient();

  const { data: competition } = await adminClient
    .from("competitions")
    .select("id, competition_key, season_id")
    .eq("slug", "liga-inatel")
    .single();

  if (!competition?.season_id) {
    return NextResponse.json({ games: [] });
  }

  const [eventsRes, resultsRes, submissionsRes] = await Promise.all([
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
      .select("id, event_id, status, home_team_name, away_team_name, home_score, away_score, submitted_by_name, submitted_by_team, submitted_at, notes, import_id")
      .order("submitted_at", { ascending: false }),
  ]);

  const resultMap = new Map((resultsRes.data ?? []).map((r: { event_id: string }) => [r.event_id, r]));
  const subsByEvent = (submissionsRes.data ?? []).reduce((acc: Record<string, unknown[]>, s: { event_id: string }) => {
    (acc[s.event_id] ??= []).push(s);
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
      submissions: subs,
    };
  });

  return NextResponse.json({ games, competition_id: competition.id });
}
