import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { hasAnyRole, MANAGERS } from "@/lib/auth/roles";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get("seasonId");
  if (!seasonId) return fail("seasonId é obrigatório");

  // Sessão + conta ativa; o papel vem de authorize() (papel ativo)
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const db = adminDb();

  const isPrivileged = hasAnyRole(auth.profile, MANAGERS);

  // Players for season (from the players table, which has the data)
  const { data: playersList } = await db
    .from("players")
    .select("id, name, number, user_id")
    .eq("season_id", seasonId);

  const profiles = playersList ?? [];

  // Training stats from view (player_id references players.id — now correctly matched)
  const { data: trainingStats } = await db
    .from("player_attendance_stats")
    .select("player_id, total_trainings, present, absent, justified, late, attendance_pct")
    .eq("season_id", seasonId);

  const trainingMap = new Map(
    (trainingStats ?? []).map((s) => [s.player_id as string, s])
  );

  // Total games in season
  const { count: totalGames } = await db
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("season_id", seasonId)
    .eq("type", "jogo");

  // Game stats: player_id + game_session_id pairs
  const { data: gameStatsRaw } = await db
    .from("player_game_stats")
    .select("player_id, game_session_id")
    .eq("season_id", seasonId);

  // Distinct game sessions with any stats
  const allSessions = new Set(
    (gameStatsRaw ?? []).map((r) => r.game_session_id as string)
  );
  const gamesWithStats = allSessions.size;

  // Per-player: distinct game sessions where they appeared
  const playerGameSessions = new Map<string, Set<string>>();
  for (const row of gameStatsRaw ?? []) {
    if (!playerGameSessions.has(row.player_id)) {
      playerGameSessions.set(row.player_id, new Set());
    }
    playerGameSessions.get(row.player_id)!.add(row.game_session_id);
  }

  // Build combined stats — if player role, restrict to own data
  const visibleProfiles = isPrivileged
    ? profiles
    : profiles.filter((p) => p.user_id === user.id);

  const players = visibleProfiles.map((p) => {
    const t = trainingMap.get(p.id);
    const gameSessions = playerGameSessions.get(p.id);
    const gamesPresent = gameSessions?.size ?? 0;

    const trainingPct: number | null = t ? Number(t.attendance_pct ?? 0) : null;

    // Games %: null if no data at all for this player
    const gamesPct: number | null =
      gamesWithStats > 0 && gamesPresent > 0
        ? Math.round((gamesPresent / gamesWithStats) * 1000) / 10
        : gamesWithStats > 0
        ? null  // has stats-covered games but player has 0 → show "—"
        : null;

    const globalPct: number | null =
      trainingPct !== null && gamesPct !== null
        ? Math.round((trainingPct + gamesPct) * 10 / 2) / 10
        : trainingPct;

    return {
      player_id: p.id,
      user_id:   p.user_id,
      name:      p.name ?? "—",
      number:    p.number,
      training:  t
        ? {
            total:     Number(t.total_trainings ?? 0),
            present:   Number(t.present   ?? 0),
            absent:    Number(t.absent    ?? 0),
            justified: Number(t.justified ?? 0),
            late:      Number(t.late      ?? 0),
            pct:       trainingPct ?? 0,
          }
        : null,
      games:
        gamesWithStats > 0
          ? {
              total_with_stats: gamesWithStats,
              present:          gamesPresent,
              pct:              gamesPct,
            }
          : null,
      global_pct: globalPct,
    };
  });

  // Team averages (privileged only)
  const trainingPcts = players
    .filter((p) => p.training !== null && p.training.total > 0)
    .map((p) => p.training!.pct);

  const gamesPcts = players
    .filter((p) => p.games !== null && p.games.present > 0)
    .map((p) => p.games!.pct ?? 0);

  const globalPcts = players
    .filter((p) => p.global_pct !== null)
    .map((p) => p.global_pct!);

  function avg(arr: number[]) {
    return arr.length
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
      : null;
  }

  return NextResponse.json({
    players,
    season: {
      total_games:      totalGames ?? 0,
      games_with_stats: gamesWithStats,
    },
    team_avg: {
      training_pct: avg(trainingPcts),
      games_pct:    avg(gamesPcts),
      global_pct:   avg(globalPcts),
    },
    is_privileged: isPrivileged,
  });
}
