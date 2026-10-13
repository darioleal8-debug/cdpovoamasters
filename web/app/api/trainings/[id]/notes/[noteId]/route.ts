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

// ─── PUT /api/trainings/[id]/notes/[noteId] ──────────────
// Apenas admin/treinador podem editar notas (qualquer nota, não só as próprias).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: training_id, noteId } = await params;
  // Sessão + conta ativa + gestão desportiva (papel ativo)
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  let body: { note_text: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  if (!body.note_text?.trim()) return fail("Nota não pode ser vazia");

  const { data, error } = await supabase
    .from("training_notes")
    .update({ note_text: body.note_text.trim(), updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("training_id", training_id)
    .select()
    .single();

  if (error) return fail(error.message, 500);
  if (!data) return fail("Nota não encontrada", 404);
  return ok({ note: data });
}

// ─── DELETE /api/trainings/[id]/notes/[noteId] ───────────
// Apenas admin/treinador podem apagar notas (qualquer nota, não só as próprias).
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: training_id, noteId } = await params;
  // Sessão + conta ativa + gestão desportiva (papel ativo)
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { error } = await supabase
    .from("training_notes")
    .delete()
    .eq("id", noteId)
    .eq("training_id", training_id);

  if (error) return fail(error.message, 500);
  return ok({ deleted: noteId });
}
