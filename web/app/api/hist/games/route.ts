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

  let query = db
    .from("hist_games")
    .select(`
      id, game_date, opponent_name, home_score, away_score,
      competition, pdf_filename, created_at,
      hist_season:hist_seasons(id, label, start_year),
      hist_player_stats(id)
    `)
    .order("game_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (seasonId) {
    query = query.eq("hist_season_id", seasonId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((g) => {
    // Supabase may return joined FK as array or object depending on schema detection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawSeason = g.hist_season as any;
    const season = (Array.isArray(rawSeason) ? rawSeason[0] : rawSeason) as { id: string; label: string; start_year: number } | null;
    const statsArr = g.hist_player_stats as { id: string }[] | null;
    return {
      id:            g.id,
      season_id:     season?.id ?? "",
      season_label:  season?.label ?? "",
      season_year:   season?.start_year ?? 0,
      game_date:     g.game_date ?? null,
      opponent_name: g.opponent_name ?? null,
      home_score:    g.home_score ?? null,
      away_score:    g.away_score ?? null,
      competition:   g.competition ?? null,
      pdf_filename:  g.pdf_filename ?? null,
      player_count:  statsArr?.length ?? 0,
      created_at:    g.created_at,
    };
  });

  return NextResponse.json({ games: rows });
}
