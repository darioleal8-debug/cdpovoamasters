import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { MANAGERS } from "@/lib/auth/roles";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

// ─── PATCH /api/player-documents/[id] ────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const allowed = ["title", "category", "status", "file_url", "storage_key", "expires_at", "notes"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k] === "" ? null : body[k];
  }

  if (!Object.keys(patch).length) return fail("Nenhum campo para atualizar");

  const { data, error } = await supabase
    .from("player_documents")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return ok({ document: data });
}

// ─── DELETE /api/player-documents/[id] ───────────────────────
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { error } = await supabase.from("player_documents").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ deleted: id });
}
