import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { PlayEventType } from "@/types/database";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ─── POST /api/play-events ───────────────────────────────────────────────────
// Regista um evento de jogo com idempotência via client_id.
// ON CONFLICT (client_id) DO NOTHING — replay da fila offline é seguro.
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: {
    client_id:        string;
    game_session_id:  string;
    season_id:        string;
    player_id?:       string | null;
    secondary_player_id?: string | null;
    event_type:       PlayEventType;
    period:           number;
    game_clock:       string;
    shot_x?:          number | null;
    shot_y?:          number | null;
    shot_zone?:       string | null;
    is_home_team:     boolean;
    points_delta:     number;
    home_score_after: number;
    away_score_after: number;
    description?:     string | null;
  };

  try {
    body = await req.json();
  } catch {
    return fail("Body JSON inválido", 400);
  }

  const {
    client_id, game_session_id, season_id, player_id, secondary_player_id,
    event_type, period, game_clock, shot_x, shot_y, shot_zone,
    is_home_team, points_delta, home_score_after, away_score_after, description,
  } = body;

  if (!client_id || !game_session_id || !season_id || !event_type) {
    return fail("Campos obrigatórios em falta: client_id, game_session_id, season_id, event_type");
  }

  // Verifica que a sessão de jogo existe e o utilizador tem acesso ao clube
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("game_sessions")
    .select("id, status")
    .eq("id", game_session_id)
    .single();

  if (sessionErr || !sessionRow) return fail("Sessão de jogo não encontrada", 404);
  if (sessionRow.status === "finished") return fail("O jogo já terminou", 409);

  // Inserção idempotente: ON CONFLICT (client_id) DO NOTHING
  const { data: inserted, error: insertErr } = await supabase
    .from("play_by_play")
    .insert({
      client_id,
      game_session_id,
      season_id,
      player_id:            player_id ?? null,
      secondary_player_id:  secondary_player_id ?? null,
      event_type,
      period,
      game_clock,
      shot_x:               shot_x ?? null,
      shot_y:               shot_y ?? null,
      shot_zone:            shot_zone ?? null,
      is_home_team,
      points_delta,
      home_score_after,
      away_score_after,
      description:          description ?? null,
      author_id:            user.id,
    })
    .select("id, client_id")
    .single();

  if (insertErr) {
    // PGRST116 = no rows returned → ON CONFLICT DO NOTHING → já existia → idempotente, OK
    if (insertErr.code === "PGRST116") {
      return ok({ id: null, client_id, duplicate: true }, 200);
    }
    return fail(insertErr.message, 500);
  }
  if (!inserted) {
    return ok({ id: null, client_id, duplicate: true }, 200);
  }

  return ok({ id: inserted.id, client_id: inserted.client_id, duplicate: false }, 201);
}

// ─── PATCH /api/play-events ──────────────────────────────────────────────────
// Soft-delete: { id, deleted_at: <ISO string> }
// Usado pelo desfazer (undo) — não apaga o registo, apenas marca deleted_at.
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: { id: string; deleted_at: string | null };
  try {
    body = await req.json();
  } catch {
    return fail("Body JSON inválido", 400);
  }

  const { id, deleted_at } = body;
  if (!id) return fail("Campo id em falta");

  // Só admin/treinador ou o próprio autor pode desfazer
  const { data: row, error: fetchErr } = await supabase
    .from("play_by_play")
    .select("id, author_id, game_session_id")
    .eq("id", id)
    .single();

  if (fetchErr || !row) return fail("Evento não encontrado", 404);

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const canEdit =
    row.author_id === user.id ||
    userRow?.role === "admin" ||
    userRow?.role === "treinador";

  if (!canEdit) return fail("Sem permissão para desfazer este evento", 403);

  const { error: updateErr } = await supabase
    .from("play_by_play")
    .update({ deleted_at: deleted_at ?? new Date().toISOString() })
    .eq("id", id);

  if (updateErr) return fail(updateErr.message, 500);
  return ok({ id, deleted_at });
}
