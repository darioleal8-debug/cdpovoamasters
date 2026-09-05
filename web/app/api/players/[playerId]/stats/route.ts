import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

type StatRow = {
  pts: number; reb_off: number; reb_def: number;
  ast: number; stl: number; blk: number; tov: number;
  fg2_made: number; fg2_att: number;
  fg3_made: number; fg3_att: number;
  ft_made: number;  ft_att: number;
  seconds_played: number; season_id: string;
  game_session_id: string; plus_minus: number; efficiency: number;
};

function sumRows(rows: StatRow[]) {
  const gp      = rows.length;
  const pts     = rows.reduce((s, r) => s + (r.pts      ?? 0), 0);
  const reb     = rows.reduce((s, r) => s + (r.reb_off  ?? 0) + (r.reb_def ?? 0), 0);
  const ast     = rows.reduce((s, r) => s + (r.ast      ?? 0), 0);
  const stl     = rows.reduce((s, r) => s + (r.stl      ?? 0), 0);
  const blk     = rows.reduce((s, r) => s + (r.blk      ?? 0), 0);
  const tov     = rows.reduce((s, r) => s + (r.tov      ?? 0), 0);
  const fg2m    = rows.reduce((s, r) => s + (r.fg2_made ?? 0), 0);
  const fg2a    = rows.reduce((s, r) => s + (r.fg2_att  ?? 0), 0);
  const fg3m    = rows.reduce((s, r) => s + (r.fg3_made ?? 0), 0);
  const fg3a    = rows.reduce((s, r) => s + (r.fg3_att  ?? 0), 0);
  const ftm     = rows.reduce((s, r) => s + (r.ft_made  ?? 0), 0);
  const fta     = rows.reduce((s, r) => s + (r.ft_att   ?? 0), 0);
  const secs    = rows.reduce((s, r) => s + (r.seconds_played ?? 0), 0);

  return {
    gp, pts, reb, ast, stl, blk, tov,
    fg2m, fg2a, fg3m, fg3a, ftm, fta, secs,
    ppg:    gp > 0 ? pts / gp : 0,
    rpg:    gp > 0 ? reb / gp : 0,
    apg:    gp > 0 ? ast / gp : 0,
    spg:    gp > 0 ? stl / gp : 0,
    bpg:    gp > 0 ? blk / gp : 0,
    tpg:    gp > 0 ? tov / gp : 0,
    mpg:    gp > 0 ? secs / gp / 60 : 0,
    fg_pct: fg2a + fg3a > 0 ? (fg2m + fg3m) / (fg2a + fg3a) : null,
    fg3_pct: fg3a > 0 ? fg3m / fg3a : null,
    ft_pct:  fta  > 0 ? ftm  / fta  : null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params;
  const db = adminClient();

  // 1. Player + season
  const { data: player, error: pErr } = await db
    .from("players")
    .select("*, seasons(id, name, status, year)")
    .eq("id", playerId)
    .single();

  if (pErr || !player) return fail("Jogador não encontrado", 404);

  const userId = player.user_id as string | null;

  if (!userId) {
    return NextResponse.json({ player, hasStats: false, currentSeason: null, history: [] });
  }

  // 2. All stats for this user (all seasons, all games)
  const { data: allStats } = await db
    .from("player_game_stats")
    .select("pts, reb_off, reb_def, ast, stl, blk, tov, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, seconds_played, season_id, game_session_id, plus_minus, efficiency")
    .eq("player_id", userId);

  const rows = (allStats ?? []) as StatRow[];

  // 3. Group by season
  const bySeason = new Map<string, StatRow[]>();
  for (const r of rows) {
    const s = r.season_id;
    const arr = bySeason.get(s) ?? [];
    arr.push(r);
    bySeason.set(s, arr);
  }

  // 4. Season names
  const seasonIds = [...bySeason.keys()];
  const { data: seasonRows } = seasonIds.length > 0
    ? await db.from("seasons").select("id, name, year, status").in("id", seasonIds)
    : { data: [] };
  const seasonMap = Object.fromEntries((seasonRows ?? []).map((s) => [s.id, s]));

  // 5. Current season per-game context (opponent + date)
  const currentSeasonId = player.season_id as string;
  const currentRows = bySeason.get(currentSeasonId) ?? [];
  const sessionIds = currentRows.map((r) => r.game_session_id).filter(Boolean);

  let ctxMap: Record<string, { opponent_name: string; event_date: string | null; home_score: number; away_score: number }> = {};
  if (sessionIds.length > 0) {
    const { data: sessions } = await db
      .from("game_sessions")
      .select("id, opponent_name, home_score, away_score, events(event_date)")
      .in("id", sessionIds);

    for (const s of sessions ?? []) {
      ctxMap[s.id] = {
        opponent_name: s.opponent_name,
        home_score:    s.home_score,
        away_score:    s.away_score,
        event_date:    ((s.events as unknown) as { event_date: string } | null)?.event_date ?? null,
      };
    }
  }

  const currentGames = currentRows.map((r) => ({
    ...r,
    ctx: ctxMap[r.game_session_id] ?? null,
  }));

  // 6. History = other seasons, newest first
  const history = [...bySeason.entries()]
    .filter(([sid]) => sid !== currentSeasonId)
    .map(([sid, srows]) => ({
      season: seasonMap[sid] ?? { id: sid, name: sid, year: "", status: "" },
      totals: sumRows(srows),
    }))
    .sort((a, b) => String(b.season.year ?? "").localeCompare(String(a.season.year ?? "")));

  return NextResponse.json({
    player,
    hasStats: true,
    currentSeason: {
      season: seasonMap[currentSeasonId] ?? (player.seasons as object),
      games: currentGames,
      totals: sumRows(currentRows),
    },
    history,
  });
}
