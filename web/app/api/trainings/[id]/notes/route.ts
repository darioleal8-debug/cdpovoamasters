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

// ─── GET /api/trainings/[id]/notes ───────────────────────
// Leitura permitida a qualquer utilizador autenticado (admin, treinador, jogador).
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

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
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { data: caller } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!caller || !canManageContent(caller.role)) {
    return fail("Apenas administradores e treinadores podem adicionar notas", 403);
  }

  let body: { note_text: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  if (!body.note_text?.trim()) return fail("Nota não pode ser vazia");

  const { data, error } = await supabase
    .from("training_notes")
    .insert({ training_id, author_id: user.id, note_text: body.note_text.trim() })
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return ok({ note: data }, 201);
}
