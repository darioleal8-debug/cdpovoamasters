import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { syncTeamChat, syncAnnouncementChat } from "@/lib/chat/team-sync";
import { canDirectMessage, canCreateGroup, type ChatRole, type ChatPostPolicy } from "@/lib/chat/permissions";

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

// ─── GET /api/chat/threads ─────────────────────────────────
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  await syncTeamChat(admin);
  await syncAnnouncementChat(admin);

  let chatIds: string[];
  if (caller.role === "admin") {
    const { data: allChats } = await admin.from("chats").select("id");
    chatIds = (allChats ?? []).map((c) => c.id as string);
  } else {
    const { data: myParticipation } = await admin
      .from("chat_participants").select("chat_id, last_read_at").eq("user_id", caller.id);
    chatIds = (myParticipation ?? []).map((p) => p.chat_id as string);
  }

  if (chatIds.length === 0) return NextResponse.json({ threads: [] });

  const { data: chats } = await admin
    .from("chats")
    .select("id, type, name, post_policy, updated_at")
    .in("id", chatIds);

  const { data: myParticipation } = await admin
    .from("chat_participants")
    .select("chat_id, user_id, last_read_at")
    .in("chat_id", chatIds);

  const lastReadByChat = new Map<string, string | null>();
  for (const p of myParticipation ?? []) {
    if (p.user_id === caller.id) lastReadByChat.set(p.chat_id as string, p.last_read_at as string | null);
  }

  const { data: messages } = await admin
    .from("chat_messages")
    .select("chat_id, sender_id, content, created_at")
    .in("chat_id", chatIds)
    .order("created_at", { ascending: false });

  const lastMessageByChat = new Map<string, { content: string; sender_id: string | null; created_at: string }>();
  const unreadCountByChat = new Map<string, number>();
  for (const m of messages ?? []) {
    const chatId = m.chat_id as string;
    if (!lastMessageByChat.has(chatId)) {
      lastMessageByChat.set(chatId, {
        content: m.content as string,
        sender_id: m.sender_id as string | null,
        created_at: m.created_at as string,
      });
    }
    const lastRead = lastReadByChat.get(chatId);
    if (!lastRead || new Date(m.created_at as string) > new Date(lastRead)) {
      unreadCountByChat.set(chatId, (unreadCountByChat.get(chatId) ?? 0) + 1);
    }
  }

  // Resolver nome de exibição para chats diretos: nome do outro participante.
  const directChatIds = (chats ?? []).filter((c) => c.type === "direct").map((c) => c.id as string);
  const otherNameByChat = new Map<string, string>();
  if (directChatIds.length > 0) {
    const { data: directParticipants } = await admin
      .from("chat_participants")
      .select("chat_id, user_id")
      .in("chat_id", directChatIds);
    const otherUserIdByChat = new Map<string, string>();
    for (const p of directParticipants ?? []) {
      if (p.user_id !== caller.id) otherUserIdByChat.set(p.chat_id as string, p.user_id as string);
    }
    const otherUserIds = [...new Set(otherUserIdByChat.values())];
    if (otherUserIds.length > 0) {
      const { data: otherUsers } = await admin.from("users").select("id, name").in("id", otherUserIds);
      const nameById = new Map((otherUsers ?? []).map((u) => [u.id as string, u.name as string]));
      for (const [chatId, userId] of otherUserIdByChat) {
        const name = nameById.get(userId);
        if (name) otherNameByChat.set(chatId, name);
      }
    }
  }

  const threads = (chats ?? []).map((c) => {
    const id = c.id as string;
    const lastMessage = lastMessageByChat.get(id) ?? null;
    return {
      id,
      type: c.type,
      name: c.type === "direct" ? (otherNameByChat.get(id) ?? c.name) : c.name,
      post_policy: c.post_policy,
      last_message: lastMessage,
      unread_count: unreadCountByChat.get(id) ?? 0,
      updated_at: lastMessage?.created_at ?? (c.updated_at as string),
    };
  });

  threads.sort((a, b) => {
    const pinned = (t: typeof a) => (t.type === "announcement" || t.type === "team" ? 0 : 1);
    const pinDiff = pinned(a) - pinned(b);
    if (pinDiff !== 0) return pinDiff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return NextResponse.json({ threads });
}

// ─── POST /api/chat/threads ─────────────────────────────────
// Body: { type: "direct" | "group"; participant_ids: string[]; name?: string; post_policy?: "all" | "admin_only" }
export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let body: { type?: string; participant_ids?: string[]; name?: string; post_policy?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const { type, participant_ids = [], name, post_policy } = body;
  if (type !== "direct" && type !== "group") return fail("Tipo de chat inválido");

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);
  const callerRole = caller.role as ChatRole;

  if (type === "direct") {
    if (participant_ids.length !== 1) return fail("Uma conversa direta precisa de exatamente um destinatário");
    const targetId = participant_ids[0];
    if (targetId === caller.id) return fail("Não podes iniciar uma conversa contigo próprio");

    const { data: target } = await admin.from("users").select("id, role").eq("id", targetId).single();
    if (!target) return fail("Utilizador não encontrado", 404);

    if (!canDirectMessage(callerRole, target.role as ChatRole)) {
      return fail("Sem permissão para conversar com este utilizador", 403);
    }

    // Get-or-create idempotente: procurar chat 'direct' existente entre os dois.
    const { data: myChats } = await admin
      .from("chat_participants").select("chat_id").eq("user_id", caller.id);
    const myChatIds = (myChats ?? []).map((c) => c.chat_id as string);

    if (myChatIds.length > 0) {
      const { data: sharedChats } = await admin
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", targetId)
        .in("chat_id", myChatIds);

      for (const sc of sharedChats ?? []) {
        const candidateId = sc.chat_id as string;
        const { data: candidateChat } = await admin
          .from("chats").select("id, type").eq("id", candidateId).single();
        if (candidateChat?.type !== "direct") continue;

        const { count } = await admin
          .from("chat_participants")
          .select("id", { count: "exact", head: true })
          .eq("chat_id", candidateId);
        if (count === 2) {
          return NextResponse.json({ chat_id: candidateId, created: false });
        }
      }
    }

    const { data: newChat, error: chatError } = await admin
      .from("chats").insert({ type: "direct", created_by: caller.id }).select("id").single();
    if (chatError || !newChat) return fail(chatError?.message ?? "Erro ao criar conversa", 500);

    await admin.from("chat_participants").insert([
      { chat_id: newChat.id, user_id: caller.id, role_in_chat: "member" },
      { chat_id: newChat.id, user_id: targetId, role_in_chat: "member" },
    ]);

    return NextResponse.json({ chat_id: newChat.id, created: true }, { status: 201 });
  }

  // type === "group"
  if (!canCreateGroup(callerRole)) return fail("Sem permissão para criar grupos", 403);
  if (!name?.trim()) return fail("Nome do grupo é obrigatório");

  // Só o admin pode escolher a permissão de escrita do grupo; outros criadores ficam sempre em "all".
  const resolvedPostPolicy: ChatPostPolicy =
    callerRole === "admin" && post_policy === "admin_only" ? "admin_only" : "all";

  const memberIds = [...new Set(participant_ids.filter((id) => id !== caller.id))];
  if (memberIds.length === 0) return fail("Seleciona pelo menos um participante");

  const { data: newChat, error: chatError } = await admin
    .from("chats")
    .insert({ type: "group", name: name.trim(), created_by: caller.id, post_policy: resolvedPostPolicy })
    .select("id")
    .single();
  if (chatError || !newChat) return fail(chatError?.message ?? "Erro ao criar grupo", 500);

  await admin.from("chat_participants").insert([
    { chat_id: newChat.id, user_id: caller.id, role_in_chat: "admin" },
    ...memberIds.map((user_id) => ({ chat_id: newChat.id, user_id, role_in_chat: "member" })),
  ]);

  return NextResponse.json({ chat_id: newChat.id, created: true }, { status: 201 });
}
