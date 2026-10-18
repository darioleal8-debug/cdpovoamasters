import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface StatRow {
  pontos: number;
  ressaltos: number;
  assistencias: number;
}

function calcStats(rows: StatRow[]): { pontos: number; ressaltos: number; assistencias: number; jogos: number } | null {
  if (!rows.length) return null;
  const n = rows.length;
  return {
    pontos:       Math.round((rows.reduce((s, r) => s + r.pontos, 0)       / n) * 10) / 10,
    ressaltos:    Math.round((rows.reduce((s, r) => s + r.ressaltos, 0)    / n) * 10) / 10,
    assistencias: Math.round((rows.reduce((s, r) => s + r.assistencias, 0) / n) * 10) / 10,
    jogos:        n,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const seasonId = searchParams.get("season_id");

  if (!seasonId) return NextResponse.json({ season: null, last5: null });

  // Player record for this user + season
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (!player) return NextResponse.json({ season: null, last5: null });

  // player_stats existe em produção mas está vazia e nada a escreve (STA-04):
  // a fonte real são os totais por jogo em player_game_stats, só de jogos terminados.
  const { data: gameRows } = await supabase
    .from("player_game_stats")
    .select("pts, reb_off, reb_def, ast, game_session:game_sessions!inner(status, event:events(event_date))")
    .eq("player_id", player.id)
    .eq("season_id", seasonId)
    .eq("game_session.status", "finished");

  type GameRow = {
    pts: number; reb_off: number; reb_def: number; ast: number;
    game_session: { event: { event_date: string } | null } | null;
  };
  const rows = ((gameRows ?? []) as unknown as GameRow[])
    .map((r) => ({
      pontos: r.pts ?? 0,
      ressaltos: (r.reb_off ?? 0) + (r.reb_def ?? 0),
      assistencias: r.ast ?? 0,
      date: r.game_session?.event?.event_date ?? "",
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const seasonRows = rows;
  const last5Rows = rows.slice(0, 5);

  return NextResponse.json({
    season: calcStats(seasonRows),
    last5:  calcStats(last5Rows),
  });
}
