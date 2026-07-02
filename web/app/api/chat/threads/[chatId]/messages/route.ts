import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { syncTeamChat } from "@/lib/chat/team-sync";
import { canPostInChat, type ChatPostPolicy } from "@/lib/chat/permissions";

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

async function canSeeChat(
  admin: ReturnType<typeof adminClient>,
  chatId: string,
  callerId: string,
  callerRole: string
): Promise<{ id: string; type: string } | null> {
  const { data: chat } = await admin.from("chats").select("id, type").eq("id", chatId).single();
  if (!chat) return null;
  if (chat.type === "announcement") return chat;
  if (callerRole === "admin") return chat;
  const { data: participant } = await admin
    .from("chat_participants").select("id").eq("chat_id", chatId).eq("user_id", callerId).maybeSingle();
  return participant ? chat : null;
}

// ─── GET /api/chat/threads/[chatId]/messages ─────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId } = await params;
  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  const chat = await canSeeChat(admin, chatId, caller.id, caller.role);
  if (!chat) return fail("Sem permissão para ver esta conversa", 403);

  if (chat.type === "team") await syncTeamChat(admin);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const before = searchParams.get("before");

  let query = admin
    .from("chat_messages")
    .select("id, chat_id, sender_id, content, attachment_url, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) return fail(error.message, 500);

  const hasMore = (rows ?? []).length > limit;
  const page = (rows ?? []).slice(0, limit).reverse();

  const senderIds = [...new Set(page.map((m) => m.sender_id).filter(Boolean) as string[])];
  let nameById = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: senders } = await admin.from("users").select("id, name").in("id", senderIds);
    nameById = new Map((senders ?? []).map((u) => [u.id as string, u.name as string]));
  }

  const messages = page.map((m) => ({
    id: m.id,
    chat_id: m.chat_id,
    sender_id: m.sender_id,
    sender_name: m.sender_id ? (nameById.get(m.sender_id as string) ?? null) : null,
    content: m.content,
    attachment_url: m.attachment_url,
    created_at: m.created_at,
  }));

  return NextResponse.json({ messages, has_more: hasMore });
}

// ─── DELETE /api/chat/threads/[chatId]/messages ──────────────
// Apenas admin. Limpa todas as mensagens de um grupo/equipa.
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
  if (caller.role !== "admin") return fail("Sem permissão para limpar mensagens", 403);

  const { data: chat } = await admin.from("chats").select("id, type").eq("id", chatId).single();
  if (!chat) return fail("Conversa não encontrada", 404);

  const { error } = await admin.from("chat_messages").delete().eq("chat_id", chatId);
  if (error) return fail(error.message, 500);

  await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

  return new NextResponse(null, { status: 204 });
}

// ─── POST /api/chat/threads/[chatId]/messages ────────────────
// Body: { content: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId } = await params;

  let body: { content?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const content = body.content?.trim();
  if (!content) return fail("Mensagem vazia");

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  const { data: chat } = await admin.from("chats").select("id, type, post_policy").eq("id", chatId).single();
  if (!chat) return fail("Conversa não encontrada", 404);

  if (caller.role !== "admin") {
    if (chat.type !== "announcement") {
      const { data: participant } = await admin
        .from("chat_participants").select("id").eq("chat_id", chatId).eq("user_id", caller.id).maybeSingle();
      if (!participant) return fail("Sem permissão para enviar mensagens nesta conversa", 403);
    }
    if (!canPostInChat(caller.role, chat.post_policy as ChatPostPolicy)) {
      return fail(
        chat.type === "announcement"
          ? "Apenas administradores podem enviar comunicados"
          : "Esta conversa é só de leitura. Apenas administradores podem escrever.",
        403
      );
    }
  }

  const { data: message, error } = await admin
    .from("chat_messages")
    .insert({ chat_id: chatId, sender_id: caller.id, content })
    .select("id, chat_id, sender_id, content, attachment_url, created_at")
    .single();
  if (error) return fail(error.message, 500);

  await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

  return NextResponse.json({ message }, { status: 201 });
}
