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

  // All season stats (for season average)
  const { data: seasonRows } = await supabase
    .from("player_stats")
    .select("pontos, ressaltos, assistencias")
    .eq("player_id", player.id)
    .eq("season_id", seasonId);

  // Last 5 games (most recently recorded)
  const { data: last5Rows } = await supabase
    .from("player_stats")
    .select("pontos, ressaltos, assistencias")
    .eq("player_id", player.id)
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    season: calcStats((seasonRows ?? []) as StatRow[]),
    last5:  calcStats((last5Rows  ?? []) as StatRow[]),
  });
}
