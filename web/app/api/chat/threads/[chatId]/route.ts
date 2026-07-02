import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { canManageChatPermissions } from "@/lib/chat/permissions";

export const runtime = "nodejs";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ─── DELETE /api/chat/threads/[chatId] ────────────────────────
// Apenas admin. Elimina um grupo (não permite eliminar DMs nem Comunicados).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId } = await params;
  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);
  if (caller.role !== "admin") return fail("Sem permissão para eliminar conversa", 403);

  const { data: chat } = await admin.from("chats").select("id, type").eq("id", chatId).single();
  if (!chat) return fail("Conversa não encontrada", 404);
  if (chat.type === "direct") return fail("Não é possível eliminar conversas diretas", 400);
  if (chat.type === "announcement") return fail("Não é possível eliminar o canal de comunicados", 400);

  // Cascade: mensagens e participantes são eliminados por FK ON DELETE CASCADE
  const { error } = await admin.from("chats").delete().eq("id", chatId);
  if (error) return fail(error.message, 500);

  return new NextResponse(null, { status: 204 });
}

// ─── PATCH /api/chat/threads/[chatId] ─────────────────────────
// Body: { post_policy: "all" | "admin_only" }
// Apenas o admin gere as permissões de escrita de cada conversa
// (grupos e o chat de equipa). Conversas diretas e Comunicados não
// são geríveis aqui (DMs são sempre "all"; Comunicados é sempre
// "admin_only" por natureza do canal).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId } = await params;

  let body: { post_policy?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  if (body.post_policy !== "all" && body.post_policy !== "admin_only") {
    return fail("post_policy inválido");
  }

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);
  if (!canManageChatPermissions(caller.role)) return fail("Sem permissão para gerir esta conversa", 403);

  const { data: chat } = await admin.from("chats").select("id, type").eq("id", chatId).single();
  if (!chat) return fail("Conversa não encontrada", 404);
  if (chat.type === "direct" || chat.type === "announcement") {
    return fail("A permissão deste tipo de conversa não pode ser alterada", 400);
  }

  const { data: updated, error } = await admin
    .from("chats")
    .update({ post_policy: body.post_policy, updated_at: new Date().toISOString() })
    .eq("id", chatId)
    .select("id, post_policy")
    .single();
  if (error) return fail(error.message, 500);

  return NextResponse.json({ chat: updated });
}
