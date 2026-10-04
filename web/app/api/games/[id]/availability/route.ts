import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lisbonDateTime } from "@/lib/event-time";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

const REASONS = ["lesao", "trabalho", "viagem", "outro"];

// ─── GET /api/games/[id]/availability ────────────────────────────────────────
// Devolve a disponibilidade do próprio jogador e, para treinador+, o plantel
// completo com a resposta de cada jogador.
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const { data: game } = await supabase
    .from("events")
    .select("id, season_id")
    .eq("id", gameId)
    .eq("type", "jogo")
    .maybeSingle();
  if (!game) return fail("Jogo não encontrado", 404);

  const { data: playerRecord } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .eq("season_id", game.season_id)
    .maybeSingle();

  let own = null;
  if (playerRecord) {
    const { data } = await supabase
      .from("game_availability")
      .select("status, reason_code, reason_text, responded_at")
      .eq("game_id", gameId)
      .eq("player_id", playerRecord.id)
      .maybeSingle();
    own = data;
  }

  // A RPC devolve zero linhas a quem não é treinador+.
  const { data: roster, error: rosterErr } = await supabase
    .rpc("game_availability_roster", { p_game_id: gameId });
  if (rosterErr) return fail(rosterErr.message, 500);

  return NextResponse.json({ own, players: roster ?? [] });
}

// ─── POST /api/games/[id]/availability ───────────────────────────────────────
// O jogador regista/altera a própria disponibilidade (até à hora do jogo).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  let body: { status?: string; reason_code?: string | null; reason_text?: string | null };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  if (!body.status || !["available", "unavailable"].includes(body.status)) {
    return fail("status deve ser 'available' ou 'unavailable'");
  }
  if (body.reason_code && !REASONS.includes(body.reason_code)) {
    return fail("reason_code inválido");
  }
  if (body.reason_text && body.reason_text.length > 140) {
    return fail("reason_text tem mais de 140 caracteres");
  }

  const { data: game } = await supabase
    .from("events")
    .select("id, season_id, event_date, event_time")
    .eq("id", gameId)
    .eq("type", "jogo")
    .maybeSingle();
  if (!game) return fail("Jogo não encontrado", 404);

  if (new Date() > lisbonDateTime(game.event_date, game.event_time)) {
    return fail("O jogo já começou — já não é possível alterar a disponibilidade", 422);
  }

  const { data: playerRecord } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .eq("season_id", game.season_id)
    .maybeSingle();
  if (!playerRecord) return fail("Não tens perfil de jogador nesta temporada", 403);

  const unavailable = body.status === "unavailable";
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("game_availability")
    .upsert(
      {
        game_id:      gameId,
        player_id:    playerRecord.id,
        status:       body.status,
        reason_code:  unavailable ? (body.reason_code ?? null) : null,
        reason_text:  unavailable ? (body.reason_text?.trim() || null) : null,
        responded_at: now,
        updated_at:   now,
        updated_by:   user.id,
      },
      { onConflict: "game_id,player_id" }
    );
  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}
