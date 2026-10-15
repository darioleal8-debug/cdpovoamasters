import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// DELETE /api/birthday-messages/[id] — delete own message (within window, via RLS)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { error } = await supabase
    .from("birthday_messages")
    .delete()
    .eq("id", id)
    .eq("author_user_id", user.id); // extra safety; RLS also enforces

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/birthday-messages/[id] — admin: toggle is_hidden; author: edit message
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: { is_hidden?: boolean; message?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Validate message length if updating text
  if (body.message !== undefined && (body.message.length < 1 || body.message.length > 280)) {
    return NextResponse.json({ error: "Mensagem entre 1 e 280 caracteres" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.is_hidden !== undefined) updates.is_hidden = body.is_hidden;
  if (body.message   !== undefined) updates.message   = body.message.trim();

  const { data, error } = await supabase
    .from("birthday_messages")
    .update(updates)
    .eq("id", id) // RLS handles who can update
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}
