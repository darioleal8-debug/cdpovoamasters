import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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

// ─── DELETE /api/chat/threads/[chatId]/messages/[messageId] ──
// Admin pode eliminar qualquer mensagem; utilizador pode eliminar as suas próprias.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId, messageId } = await params;
  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  const { data: message } = await admin
    .from("chat_messages")
    .select("id, chat_id, sender_id")
    .eq("id", messageId)
    .eq("chat_id", chatId)
    .single();
  if (!message) return fail("Mensagem não encontrada", 404);

  const isAdmin = caller.role === "admin";
  const isOwner = message.sender_id === caller.id;
  if (!isAdmin && !isOwner) return fail("Sem permissão para eliminar esta mensagem", 403);

  const { error } = await admin.from("chat_messages").delete().eq("id", messageId);
  if (error) return fail(error.message, 500);

  return new NextResponse(null, { status: 204 });
}
