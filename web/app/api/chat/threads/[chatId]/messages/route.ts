import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
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

type ChatRow = { id: string; type: string; status: string; post_policy: string | null };

async function canSeeChat(
  admin: ReturnType<typeof adminClient>,
  chatId: string,
  callerId: string,
  callerRole: string
): Promise<ChatRow | null> {
  const { data: chat } = await admin
    .from("chats").select("id, type, status, post_policy").eq("id", chatId).single();
  if (!chat) return null;
  if (chat.type === "announcement") return chat;
  if (callerRole === "admin") return chat;
  const { data: p } = await admin
    .from("chat_participants").select("id").eq("chat_id", chatId).eq("user_id", callerId).maybeSingle();
  return p ? chat : null;
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

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const before = searchParams.get("before");

  let query = admin
    .from("chat_messages")
    .select("id, chat_id, sender_id, sender_role, content, card_type, card_data, is_system, hidden_at, attachment_url, created_at")
    .eq("chat_id", chatId)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) return fail(error.message, 500);

  const hasMore = (rows ?? []).length > limit;
  const page = (rows ?? []).slice(0, limit).reverse();

  // Resolver nomes dos remetentes
  const senderIds = [...new Set(page.map((m: { sender_id: string | null }) => m.sender_id).filter(Boolean) as string[])];
  let userById = new Map<string, { name: string; role: string }>();
  if (senderIds.length > 0) {
    const { data: users } = await admin.from("users").select("id, name, role").in("id", senderIds);
    userById = new Map((users ?? []).map((u: { id: string; name: string; role: string }) => [u.id, { name: u.name, role: u.role }]));
  }

  // Leituras por mensagem (para "lido por N")
  const msgIds = page.map((m: { id: string }) => m.id);
  let readsByMsg = new Map<string, number>();
  if (msgIds.length > 0) {
    const { data: reads } = await admin
      .from("chat_message_reads")
      .select("message_id, user_id")
      .in("message_id", msgIds)
      .neq("user_id", caller.id);
    for (const r of (reads ?? []) as Array<{ message_id: string; user_id: string }>) {
      readsByMsg.set(r.message_id, (readsByMsg.get(r.message_id) ?? 0) + 1);
    }
  }

  type MsgRow = {
    id: string; chat_id: string; sender_id: string | null; sender_role: string | null;
    content: string | null; card_type: string | null; card_data: unknown;
    is_system: boolean; attachment_url: string | null; created_at: string;
  };

  const messages = (page as MsgRow[]).map((m) => {
    const user = m.sender_id ? userById.get(m.sender_id) : null;
    return {
      id:             m.id,
      chat_id:        m.chat_id,
      sender_id:      m.sender_id,
      sender_name:    user?.name ?? null,
      sender_role:    m.sender_role ?? user?.role ?? null,
      content:        m.content,
      card_type:      m.card_type,
      card_data:      m.card_data,
      is_system:      m.is_system,
      attachment_url: m.attachment_url,
      created_at:     m.created_at,
      read_by_count:  readsByMsg.get(m.id) ?? 0,
      is_mine:        m.sender_id === caller.id,
    };
  });

  // Marcar lido ao carregar
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/chat_participants?chat_id=eq.${chatId}&user_id=eq.${caller.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_read_at: new Date().toISOString() }),
    }
  ).catch(() => {});

  return NextResponse.json({ messages, has_more: hasMore });
}

// ─── POST /api/chat/threads/[chatId]/messages ────────────────
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

  const chat = await canSeeChat(admin, chatId, caller.id, caller.role);
  if (!chat) return fail("Sem permissão", 403);

  if (chat.status === "archived") return fail("Este fio está arquivado e é só de leitura", 403);

  // Verificar se pode escrever
  if (caller.role !== "admin" && chat.post_policy === "admin_only") {
    return fail("Esta conversa é só de leitura para ti", 403);
  }
  if (caller.role !== "admin" && chat.type !== "announcement") {
    const { data: p } = await admin
      .from("chat_participants").select("id").eq("chat_id", chatId).eq("user_id", caller.id).maybeSingle();
    if (!p) return fail("Sem permissão para escrever nesta conversa", 403);
  }

  const { data: message, error } = await admin
    .from("chat_messages")
    .insert({ chat_id: chatId, sender_id: caller.id, sender_role: caller.role, content })
    .select("id, chat_id, sender_id, sender_role, content, card_type, card_data, is_system, attachment_url, created_at")
    .single();
  if (error) return fail(error.message, 500);

  // Marcar lida pelo remetente (chat_message_reads + last_read_at em chat_participants)
  const now = new Date().toISOString();
  await Promise.allSettled([
    admin.from("chat_message_reads").insert({ message_id: message.id, user_id: caller.id }),
    admin.from("chat_participants")
      .update({ last_read_at: now })
      .eq("chat_id", chatId)
      .eq("user_id", caller.id),
    admin.from("chats").update({ updated_at: now }).eq("id", chatId),
  ]);

  return NextResponse.json({
    message: {
      ...message,
      sender_name: null,
      read_by_count: 0,
      is_mine: true,
    },
  }, { status: 201 });
}

// ─── DELETE (admin) ─────────────────────────────────────────
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
  if (!caller || caller.role !== "admin") return fail("Sem permissão", 403);

  const { error } = await admin.from("chat_messages").delete().eq("chat_id", chatId);
  if (error) return fail(error.message, 500);

  await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
  return new NextResponse(null, { status: 204 });
}
