import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";
import { loadPendingConfirmations } from "@/lib/trainings/pending-confirmations";

export const runtime = "nodejs";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// GET /api/training-confirmations
// Treinos já terminados a que o utilizador disse que ia e ainda não confirmou se foi.
export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const admin = await createAdminClient();
  const pending = await loadPendingConfirmations(admin, auth.user.id);
  return NextResponse.json({ pending });
}

// POST /api/training-confirmations { training_id, attended }
// Regista "present" ou "absent" para o próprio jogador. O treinador pode corrigir depois no ecrã de presenças.
export async function POST(req: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  let body: { training_id?: unknown; attended?: unknown };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  if (typeof body.training_id !== "string" || typeof body.attended !== "boolean") {
    return fail("training_id e attended são obrigatórios");
  }

  const admin = await createAdminClient();
  // A confirmação só vale para um pendente do próprio utilizador (disse que ia, treino terminado, sem presença).
  const pending = await loadPendingConfirmations(admin, auth.user.id);
  const item = pending.find((p) => p.training_id === body.training_id);
  if (!item) return fail("Este treino já não está pendente de confirmação.", 409);

  const { data: training } = await admin.from("trainings").select("id, club_id").eq("id", item.training_id).maybeSingle();
  if (!training) return fail("Treino não encontrado.", 404);

  const now = new Date().toISOString();
  const { error } = await admin.from("training_attendance").insert({
    training_id: item.training_id,
    club_id: training.club_id,
    player_id: item.player_id,
    status: body.attended ? "present" : "absent",
    method: "manual",
    gps_validated: false,
    updated_at: now,
    updated_by: auth.user.id,
  });
  if (error) {
    // Já registada entretanto (treinador ou outro dispositivo): a notificação deixa de fazer sentido
    return error.code === "23505" ? fail("A presença deste treino já foi registada.", 409) : fail(error.message, 500);
  }
  return NextResponse.json({ success: true, training_id: item.training_id, status: body.attended ? "present" : "absent" });
}
