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

  // Resolver session IDs: apenas jogos oficiais terminados (excluir treinos/amigáveis, is_test, eliminados e result_only)
  const { data: evData } = await supabase
    .from("events")
    .select("id, event_date")
    .eq("season_id", seasonId)
    .eq("type", "jogo")
    .eq("game_type", "official")
    .eq("is_test", false)
    .is("deleted_at", null);

  const eventIds = (evData ?? []).map((e) => e.id as string);
  if (eventIds.length === 0) return NextResponse.json({ season: null, last5: null });

  const { data: sessData } = await supabase
    .from("game_sessions")
    .select("id, event_id")
    .in("event_id", eventIds)
    .eq("status", "finished")
    .neq("stats_source", "result_only");

  const allowedSessionIds = (sessData ?? []).map((s) => s.id as string);
  if (allowedSessionIds.length === 0) return NextResponse.json({ season: null, last5: null });

  // Mapa session_id → event_date para ordenação
  const sessionEventDate = new Map<string, string>();
  for (const sess of sessData ?? []) {
    const ev = (evData ?? []).find((e) => e.id === (sess as { id: string; event_id: string }).event_id);
    if (ev) sessionEventDate.set(sess.id as string, (ev as { id: string; event_date?: string }).event_date ?? "");
  }

  // player_stats existe em produção mas está vazia e nada a escreve (STA-04):
  // a fonte real são os totais por jogo em player_game_stats, só de jogos terminados com live stats.
  const { data: gameRows } = await supabase
    .from("player_game_stats")
    .select("pts, reb_off, reb_def, ast, game_session_id")
    .eq("player_id", player.id)
    .eq("season_id", seasonId)
    .in("game_session_id", allowedSessionIds);

  type GameRow = { pts: number; reb_off: number; reb_def: number; ast: number; game_session_id: string };
  const rows = ((gameRows ?? []) as unknown as GameRow[])
    .map((r) => ({
      pontos: r.pts ?? 0,
      ressaltos: (r.reb_off ?? 0) + (r.reb_def ?? 0),
      assistencias: r.ast ?? 0,
      date: sessionEventDate.get(r.game_session_id) ?? "",
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const seasonRows = rows;
  const last5Rows = rows.slice(0, 5);

  return NextResponse.json({
    season: calcStats(seasonRows),
    last5:  calcStats(last5Rows),
  });
}
