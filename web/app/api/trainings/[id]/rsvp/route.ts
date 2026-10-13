import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ─── GET /api/trainings/[id]/rsvp ────────────────────────────────────────────
// Devolve: sumário de RSVPs + estado do próprio jogador.
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  // Sumário via view
  const { data: summary, error: sumErr } = await supabase
    .from("v_training_rsvp_summary")
    .select("going_count, not_going_count, no_response_count, total_players, rsvp_deadline_hours, min_players")
    .eq("training_id", trainingId)
    .maybeSingle();

  if (sumErr) return fail(sumErr.message, 500);

  // RSVP próprio: perfil da época do treino (não o mais recente)
  const { data: trainingRow } = await supabase
    .from("trainings").select("season_id").eq("id", trainingId).maybeSingle();
  const { data: playerRecord } = trainingRow
    ? await supabase
        .from("players")
        .select("id")
        .eq("user_id", user.id)
        .eq("season_id", trainingRow.season_id)
        .maybeSingle()
    : { data: null };

  let own = null;
  if (playerRecord) {
    const { data } = await supabase
      .from("training_rsvps")
      .select("status, reason_code, reason_text, responded_at")
      .eq("training_id", trainingId)
      .eq("player_id", playerRecord.id)
      .maybeSingle();
    own = data;
  }

  return NextResponse.json({ summary, own });
}

// ─── POST /api/trainings/[id]/rsvp ───────────────────────────────────────────
// Jogador regista/altera o próprio RSVP (com validação de prazo no servidor).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: { status?: string; reason_code?: string | null; reason_text?: string | null };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  if (!body.status || !["going", "not_going"].includes(body.status)) {
    return fail("status deve ser 'going' ou 'not_going'");
  }
  if (body.reason_code && !["lesao", "trabalho", "viagem", "outro"].includes(body.reason_code)) {
    return fail("reason_code inválido");
  }
  if (body.reason_text && body.reason_text.length > 140) {
    return fail("reason_text tem mais de 140 caracteres");
  }

  // Buscar treino para validar prazo
  const { data: training, error: tErr } = await supabase
    .from("trainings")
    .select("date, start_time, rsvp_deadline_hours, season_id")
    .eq("id", trainingId)
    .maybeSingle();

  if (tErr || !training) return fail("Treino não encontrado", 404);

  // Validação de prazo (servidor) — treinadores+: sem prazo
  const { data: isTrainer } = await supabase.rpc("is_trainer_or_above");
  if (!isTrainer) {
    const trainingStart = new Date(`${training.date}T${training.start_time}`);
    const deadline = new Date(trainingStart.getTime() - training.rsvp_deadline_hours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return fail("O prazo de confirmação já passou", 422);
    }
  }

  // Buscar player_id na temporada do treino
  const { data: playerRecord, error: pErr } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .eq("season_id", training.season_id)
    .maybeSingle();

  if (pErr || !playerRecord) return fail("Não tens perfil de jogador nesta temporada", 403);

  // Upsert
  const { error: upsertErr } = await supabase
    .from("training_rsvps")
    .upsert(
      {
        training_id:  trainingId,
        player_id:    playerRecord.id,
        status:       body.status,
        reason_code:  body.status === "not_going" ? (body.reason_code ?? null) : null,
        reason_text:  body.status === "not_going" ? (body.reason_text ?? null) : null,
        responded_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
        updated_by:   user.id,
      },
      { onConflict: "training_id,player_id" }
    );

  if (upsertErr) return fail(upsertErr.message, 500);

  return NextResponse.json({ success: true });
}
