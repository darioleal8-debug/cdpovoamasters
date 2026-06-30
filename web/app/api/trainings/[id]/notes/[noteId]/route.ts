import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { canManageContent } from "@/lib/permissions";

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
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function isManager(supabase: Awaited<ReturnType<typeof getSupabase>>["supabase"], userId: string) {
  const { data: caller } = await supabase.from("users").select("role").eq("id", userId).single();
  return !!caller && canManageContent(caller.role);
}

// ─── PUT /api/trainings/[id]/notes/[noteId] ──────────────
// Apenas admin/treinador podem editar notas (qualquer nota, não só as próprias).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: training_id, noteId } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);
  if (!(await isManager(supabase, user.id))) {
    return fail("Apenas administradores e treinadores podem editar notas", 403);
  }

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
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);
  if (!(await isManager(supabase, user.id))) {
    return fail("Apenas administradores e treinadores podem apagar notas", 403);
  }

  const { error } = await supabase
    .from("training_notes")
    .delete()
    .eq("id", noteId)
    .eq("training_id", training_id);

  if (error) return fail(error.message, 500);
  return ok({ deleted: noteId });
}
