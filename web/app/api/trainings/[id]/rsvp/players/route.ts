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

async function requireTrainer(supabase: ReturnType<typeof createServerClient>) {
  const { data: ok } = await supabase.rpc("is_trainer_or_above");
  return !!ok;
}

// ─── GET /api/trainings/[id]/rsvp/players ────────────────────────────────────
// Lista nominal de RSVPs — apenas treinador+.
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);
  if (!(await requireTrainer(supabase))) return fail("Permissão negada", 403);

  // Buscar treino para obter season_id
  const { data: training } = await supabase
    .from("trainings")
    .select("season_id, date, start_time, rsvp_deadline_hours")
    .eq("id", trainingId)
    .maybeSingle();

  if (!training) return fail("Treino não encontrado", 404);

  // Lista de jogadores activos desta temporada
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, jersey_number, user_display_names(name)")
    .eq("season_id", training.season_id)
    .order("jersey_number", { ascending: true, nullsFirst: false });

  if (pErr) return fail(pErr.message, 500);

  // RSVPs para este treino
  const { data: rsvps } = await supabase
    .from("training_rsvps")
    .select("player_id, status, reason_code, reason_text, responded_at")
    .eq("training_id", trainingId);

  const rsvpMap = new Map(
    (rsvps ?? []).map((r) => [r.player_id, r])
  );

  const rows = (players ?? []).map((p) => {
    const r = rsvpMap.get(p.id);
    const udn = Array.isArray(p.user_display_names)
      ? p.user_display_names[0]
      : p.user_display_names;
    return {
      player_id:    p.id,
      name:         (udn as { name: string } | null)?.name ?? "—",
      jersey_number: p.jersey_number,
      status:       r?.status ?? null,
      reason_code:  r?.reason_code ?? null,
      reason_text:  r?.reason_text ?? null,
      responded_at: r?.responded_at ?? null,
    };
  });

  const deadline = new Date(
    new Date(`${training.date}T${training.start_time}`).getTime()
    - training.rsvp_deadline_hours * 3_600_000
  ).toISOString();

  return NextResponse.json({ players: rows, deadline });
}

// ─── POST /api/trainings/[id]/rsvp/players ───────────────────────────────────
// Treinador define RSVP de qualquer jogador (sem prazo).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);
  if (!(await requireTrainer(supabase))) return fail("Permissão negada", 403);

  let body: {
    player_id?: string;
    status?: string | null;
    reason_code?: string | null;
    reason_text?: string | null;
  };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  if (!body.player_id) return fail("player_id obrigatório");

  // null status = apagar o RSVP
  if (body.status === null || body.status === undefined) {
    await supabase
      .from("training_rsvps")
      .delete()
      .eq("training_id", trainingId)
      .eq("player_id", body.player_id);
    return NextResponse.json({ success: true });
  }

  if (!["going", "not_going"].includes(body.status)) {
    return fail("status deve ser 'going', 'not_going' ou null");
  }
  if (body.reason_code && !["lesao", "trabalho", "viagem", "outro"].includes(body.reason_code)) {
    return fail("reason_code inválido");
  }

  const { error } = await supabase
    .from("training_rsvps")
    .upsert(
      {
        training_id:  trainingId,
        player_id:    body.player_id,
        status:       body.status,
        reason_code:  body.status === "not_going" ? (body.reason_code ?? null) : null,
        reason_text:  body.status === "not_going" ? (body.reason_text ?? null) : null,
        responded_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
        updated_by:   user.id,
      },
      { onConflict: "training_id,player_id" }
    );

  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}
