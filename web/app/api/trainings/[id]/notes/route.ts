import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { MANAGERS } from "@/lib/auth/roles";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

// ─── GET /api/trainings/[id]/notes ───────────────────────
// Leitura permitida a qualquer utilizador autenticado (admin, treinador, jogador).
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("training_notes")
    .select("*")
    .eq("training_id", id)
    .order("created_at", { ascending: true });

  if (error) return fail(error.message, 500);
  return ok({ notes: data ?? [] });
}

// ─── POST /api/trainings/[id]/notes ──────────────────────
// Apenas admin/treinador podem criar notas.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: training_id } = await params;
  // Sessão + conta ativa + gestão desportiva (papel ativo)
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let body: { note_text: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const trimmed = body.note_text?.trim() ?? "";
  if (!trimmed) return fail("Nota não pode ser vazia");
  if (trimmed.length > 300) return fail("Nota não pode exceder 300 caracteres");

  // Limite de 10 notas por treino
  const { count } = await supabase
    .from("training_notes")
    .select("id", { count: "exact", head: true })
    .eq("training_id", training_id);
  if ((count ?? 0) >= 10) return fail("Máximo de 10 notas por treino atingido", 422);

  const { data, error } = await supabase
    .from("training_notes")
    .insert({ training_id, author_id: user.id, note_text: trimmed })
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return ok({ note: data }, 201);
}
