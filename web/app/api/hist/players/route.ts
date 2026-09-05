import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get("season_id");
  const db = adminClient();

  // Load players with their stats joined through games
  let query = db
    .from("hist_player_stats")
    .select(`
      hist_player_id,
      hist_season_id,
      pts, reb_off, reb_def, ast, stl, blk, tov, efficiency,
      hist_player:hist_players(id, name),
      hist_season:hist_seasons(id, label, start_year)
    `);

  if (seasonId) {
    query = query.eq("hist_season_id", seasonId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate per player per season
  const map = new Map<string, {
    player_id: string; player_name: string;
    season_id: string; season_label: string; season_year: number;
    games: number;
    total_pts: number; total_reb: number; total_ast: number;
    total_stl: number; total_blk: number; total_tov: number; total_eff: number;
  }>();

  for (const row of (data ?? [])) {
    // Supabase FK joins may return arrays; unwrap first element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawP = row.hist_player as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawS = row.hist_season as any;
    const p = (Array.isArray(rawP) ? rawP[0] : rawP) as { id: string; name: string } | null;
    const s = (Array.isArray(rawS) ? rawS[0] : rawS) as { id: string; label: string; start_year: number } | null;
    if (!p || !s) continue;
    const key = `${p.id}__${s.id}`;
    const cur = map.get(key) ?? {
      player_id: p.id, player_name: p.name,
      season_id: s.id, season_label: s.label, season_year: s.start_year,
      games: 0, total_pts: 0, total_reb: 0, total_ast: 0,
      total_stl: 0, total_blk: 0, total_tov: 0, total_eff: 0,
    };
    cur.games++;
    cur.total_pts += row.pts;
    cur.total_reb += row.reb_off + row.reb_def;
    cur.total_ast += row.ast;
    cur.total_stl += row.stl;
    cur.total_blk += row.blk;
    cur.total_tov += row.tov;
    cur.total_eff += row.efficiency;
    map.set(key, cur);
  }

  const rows = Array.from(map.values()).map((r) => ({
    player_id:    r.player_id,
    player_name:  r.player_name,
    season_id:    r.season_id,
    season_label: r.season_label,
    season_year:  r.season_year,
    games:        r.games,
    total_pts:    r.total_pts,
    total_reb:    r.total_reb,
    total_ast:    r.total_ast,
    total_stl:    r.total_stl,
    total_blk:    r.total_blk,
    total_tov:    r.total_tov,
    avg_pts:      r.games > 0 ? +(r.total_pts / r.games).toFixed(1) : 0,
    avg_reb:      r.games > 0 ? +(r.total_reb / r.games).toFixed(1) : 0,
    avg_ast:      r.games > 0 ? +(r.total_ast / r.games).toFixed(1) : 0,
    avg_eff:      r.games > 0 ? +(r.total_eff / r.games).toFixed(1) : 0,
  }));

  rows.sort((a, b) => a.player_name.localeCompare(b.player_name, "pt") || a.season_year - b.season_year);

  return NextResponse.json({ rows });
}
