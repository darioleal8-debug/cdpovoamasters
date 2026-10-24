import { createAdminClient } from "@/lib/supabase/server";
import { computeStandings, parseGameMeta, type Competition, type LeagueGameResult, type LeagueTeam, type PublicGame, type StandingRow } from "@/types/competitions";

// ─── Competition ─────────────────────────────────────────────────────────────

export async function getCompetitionBySlug(slug: string): Promise<Competition | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("competitions")
    .select("*")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();
  return data ?? null;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function getOurTeamName(): Promise<string> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_teams")
    .select("name")
    .eq("is_our_team", true)
    .single();
  return data?.name ?? "CD Póvoa";
}

export async function getLeagueTeams(competitionKey: string): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_teams")
    .select("name")
    .eq("is_placeholder", false)
    .eq("is_our_team", false)
    .order("name", { ascending: true });
  return (data ?? []).map((t) => t.name);
}

export async function getLeagueTeamsWithDetails(): Promise<LeagueTeam[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_teams")
    .select("*")
    .order("is_our_team", { ascending: false })
    .order("name");
  return (data ?? []) as LeagueTeam[];
}

export async function getTeamBySlug(slug: string): Promise<LeagueTeam | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_teams")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as LeagueTeam) ?? null;
}

// ─── Games (events + merged result/submission state) ─────────────────────────

type EventRow = {
  id: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  description: string | null;
  season_id: string;
  opponent: string | null;
  competition: string | null;
};

type GameSessionRow = {
  id: string;
  event_id: string;
  status: string;
};

export async function getCompetitionGames(
  competitionKey: string,
  seasonId: string
): Promise<PublicGame[]> {
  const supabase = await createAdminClient();
  const ourTeam = await getOurTeamName();

  const [eventsRes, resultsRes, sessionsRes, pendingRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, event_date, event_time, location, description, season_id, opponent, competition")
      .eq("type", "jogo")
      .eq("competition", competitionKey)
      .eq("season_id", seasonId)
      .is("deleted_at", null)
      .order("event_date", { ascending: true }),

    supabase
      .from("league_game_results")
      .select("*"),

    supabase
      .from("game_sessions")
      .select("id, event_id, status")
      .in("status", ["live", "scheduled"]),

    supabase
      .from("result_submissions")
      .select("event_id, status")
      .eq("status", "pending"),
  ]);

  const events: EventRow[] = eventsRes.data ?? [];
  const results: LeagueGameResult[] = resultsRes.data ?? [];
  const sessions: GameSessionRow[] = sessionsRes.data ?? [];
  const pending: { event_id: string; status: string }[] = pendingRes.data ?? [];

  const resultByEventId = new Map(results.map((r) => [r.event_id, r]));
  const liveSessionByEventId = new Map(
    sessions.filter((s) => s.status === "live").map((s) => [s.event_id, s])
  );
  const pendingCountByEventId = pending.reduce((acc, p) => {
    acc.set(p.event_id, (acc.get(p.event_id) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  // syntheticJornada: accumulate offset across voltas so jornada is globally unique
  const voltaOffsets = new Map<number, number>();
  let maxJornada = 0;
  for (const e of events) {
    const m = parseGameMeta(e.description);
    if (!m?.jornada || !m?.volta) continue;
    const v = m.volta;
    if (!voltaOffsets.has(v)) {
      voltaOffsets.set(v, maxJornada);
    }
    const synthetic = voltaOffsets.get(v)! + m.jornada;
    if (synthetic > maxJornada) maxJornada = synthetic;
  }

  return events.map((e): PublicGame => {
    const meta = parseGameMeta(e.description);
    const result = resultByEventId.get(e.id) ?? null;
    const liveSession = liveSessionByEventId.get(e.id);
    const pendingCount = pendingCountByEventId.get(e.id) ?? 0;

    const homeTeam = meta?.home_team ?? ourTeam;
    const awayTeam = meta?.away_team ?? (e.opponent ?? "Adversário");

    const volta = meta?.volta ?? null;
    const jornada = meta?.jornada ?? null;
    const offset = volta !== null && voltaOffsets.has(volta) ? voltaOffsets.get(volta)! : 0;
    const syntheticJornada = jornada !== null ? offset + jornada : 0;

    const isOurGame =
      homeTeam.toLowerCase().includes("póvoa") ||
      awayTeam.toLowerCase().includes("póvoa") ||
      homeTeam === ourTeam ||
      awayTeam === ourTeam;

    let resultStatus: PublicGame["result_status"] = "no_result";
    if (liveSession) resultStatus = "live";
    else if (result) resultStatus = "approved";
    else if (pendingCount > 0) resultStatus = "pending";

    return {
      id: e.id,
      event_date: e.event_date,
      event_time: e.event_time,
      location: e.location,
      home_team: homeTeam,
      away_team: awayTeam,
      jornada,
      volta,
      syntheticJornada,
      result: result ? { home_score: result.home_score, away_score: result.away_score } : null,
      result_status: resultStatus,
      pending_count: pendingCount,
      live_game_url: liveSession ? `/live/${liveSession.id}` : null,
      is_our_game: isOurGame,
      is_test: meta?.is_test === true,
    };
  });
}

// ─── Standings ────────────────────────────────────────────────────────────────

export async function getStandings(competitionId: string): Promise<StandingRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_game_results")
    .select("home_team_name, away_team_name, home_score, away_score")
    .eq("competition_id", competitionId);
  return computeStandings(data ?? []);
}

export type StandingRowWithForm = StandingRow & { form: ("V" | "D")[] };

export async function getStandingsWithForm(competitionId: string): Promise<StandingRowWithForm[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_game_results")
    .select("home_team_name, away_team_name, home_score, away_score, approved_at")
    .eq("competition_id", competitionId)
    .order("approved_at", { ascending: false });

  const results = (data ?? []) as (StandingRow extends never ? never : {
    home_team_name: string; away_team_name: string;
    home_score: number; away_score: number; approved_at: string;
  })[];

  const standings = computeStandings(results);

  return standings.map((s) => ({
    ...s,
    form: (results as { home_team_name: string; away_team_name: string; home_score: number; away_score: number }[])
      .filter((r) => r.home_team_name === s.team_name || r.away_team_name === s.team_name)
      .slice(0, 5)
      .map((r) => {
        const isHome = r.home_team_name === s.team_name;
        const homeWon = r.home_score > r.away_score;
        return ((isHome ? homeWon : !homeWon) ? "V" : "D") as "V" | "D";
      }),
  }));
}

export async function getTeamNames(): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_teams")
    .select("name")
    .eq("is_placeholder", false)
    .eq("is_our_team", false)
    .order("name");
  return (data ?? []).map((t) => t.name);
}

export async function getTeamLogos(): Promise<Record<string, string | null>> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("league_teams")
    .select("name, logo_url")
    .eq("is_placeholder", false);
  const map: Record<string, string | null> = {};
  for (const t of data ?? []) {
    map[t.name] = t.logo_url ?? null;
  }
  return map;
}

// ─── Admin: pending submissions ───────────────────────────────────────────────

export type AdminSubmission = {
  id: string;
  event_id: string;
  competition_id: string | null;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  submitted_by_name: string;
  submitted_by_team: string | null;
  submitted_by_contact: string | null;
  notes: string | null;
  submitted_at: string;
  status: string;
  rejection_reason: string | null;
  event: { event_date: string; event_time: string | null; location: string | null } | null;
};

export async function getPendingSubmissions(): Promise<AdminSubmission[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("result_submissions")
    .select(`
      id, event_id, competition_id,
      home_team_name, away_team_name, home_score, away_score,
      submitted_by_name, submitted_by_team, submitted_by_contact,
      notes, submitted_at, status, rejection_reason,
      event:events(event_date, event_time, location)
    `)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });
  return (data ?? []) as unknown as AdminSubmission[];
}

export async function getPendingSubmissionCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count } = await supabase
    .from("result_submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export async function getSubmission(id: string): Promise<AdminSubmission | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("result_submissions")
    .select(`
      id, event_id, competition_id,
      home_team_name, away_team_name, home_score, away_score,
      submitted_by_name, submitted_by_team, submitted_by_contact,
      notes, submitted_at, status, rejection_reason,
      event:events(event_date, event_time, location)
    `)
    .eq("id", id)
    .single();
  return (data as unknown as AdminSubmission) ?? null;
}

// ─── Notícias Liga INATEL ─────────────────────────────────────────────────────
// Lê da tabela `news` (category='Liga INATEL'). A tabela `noticias` está deprecated.

export type NoticiaPublic = {
  id: string;
  slug: string;
  game_id: string | null;
  title: string;
  excerpt: string;
  body: string;
  cover_image_url: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  published_at: string | null;
  created_at: string;
};

export async function getLatestNoticias(limit = 4): Promise<NoticiaPublic[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("news")
    .select("id, slug, game_id, title, excerpt, body, cover_image_url, home_team_name, away_team_name, published_at, created_at")
    .eq("category", "Liga INATEL")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NoticiaPublic[];
}
