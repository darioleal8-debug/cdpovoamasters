import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { hasAnyRole, MANAGERS } from "@/lib/auth/roles";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ─── GET /api/trainings/[id]/rsvp/players ────────────────────────────────────
// Lista nominal de RSVPs — apenas treinador+.
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;
  // Sessão + conta ativa; auth.profile traz o papel ativo
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  if (!hasAnyRole(auth.profile, MANAGERS)) return fail("Permissão negada", 403);

  // Buscar treino para obter season_id
  const { data: training } = await supabase
    .from("trainings")
    .select("season_id, date, start_time, rsvp_deadline_hours")
    .eq("id", trainingId)
    .maybeSingle();

  if (!training) return fail("Treino não encontrado", 404);

  // Lista de jogadores activos desta temporada
  // players não tem jersey_number (é number) nem FK para user_display_names: nomes à parte
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, number, user_id")
    .eq("season_id", training.season_id)
    .order("number", { ascending: true, nullsFirst: false });

  if (pErr) return fail(pErr.message, 500);

  const userIds = (players ?? []).map((p) => p.user_id as string).filter(Boolean);
  const { data: names } = userIds.length > 0
    ? await supabase.from("user_display_names").select("id, name").in("id", userIds)
    : { data: [] as { id: string; name: string }[] };
  const nameByUser = new Map((names ?? []).map((n) => [n.id as string, n.name as string]));

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
    return {
      player_id:    p.id,
      name:         nameByUser.get(p.user_id as string) ?? "—",
      jersey_number: p.number,
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
  // Sessão + conta ativa; auth.profile traz o papel ativo
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  if (!hasAnyRole(auth.profile, MANAGERS)) return fail("Permissão negada", 403);

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
