import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { syncTeamChat, syncAnnouncementChat } from "@/lib/chat/team-sync";
import { ensureStaffChat } from "@/lib/chat/staff-sync";
import { syncGameEventChats } from "@/lib/chat/event-thread-sync";
import { canDirectMessage, canCreateGroup, type ChatRole, type ChatPostPolicy } from "@/lib/chat/permissions";

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

function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((new Date(dateStr + "T00:00:00").getTime() - today) / 86_400_000);
}

// ── Throttle de sync ─────────────────────────────────────────
// As funções de sync (syncTeamChat, syncAnnouncementChat, etc.) são
// idempotentes mas dispendiosas — cada uma faz 3-5 queries à BD.
// Sem throttle, executavam a cada request (mount + realtime + polling).
// Com throttle por instância quente (module-level Map), executam no
// máximo uma vez por 5 minutos por utilizador. Em cold-starts reexecutam,
// o que é aceitável (garante consistência após deploy).
const _syncTs = new Map<string, number>();
const SYNC_TTL_MS = 5 * 60_000; // 5 min

async function throttledSync(userId: string, isStaff: boolean, admin: ReturnType<typeof adminClient>): Promise<void> {
  const last = _syncTs.get(userId) ?? 0;
  if (Date.now() - last < SYNC_TTL_MS) return;
  _syncTs.set(userId, Date.now());
  try {
    await Promise.all([
      syncTeamChat(admin),
      syncAnnouncementChat(admin),
      isStaff ? ensureStaffChat(admin) : Promise.resolve(),
      isStaff ? syncGameEventChats(admin) : Promise.resolve(),
    ]);
  } catch {
    // Sync não-fatal — o utilizador vê threads existentes mesmo que o sync falhe
    _syncTs.delete(userId); // permitir retry no próximo request
  }
}

// ─── GET /api/chat/threads ─────────────────────────────────
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("id, role, name").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  const isStaff = ["admin", "treinador"].includes(caller.role);

  // Sync throttled — no máximo uma vez por 5 min por utilizador
  await throttledSync(caller.id, isStaff, admin);

  // IDs de chats em que o utilizador participa
  let chatIds: string[];
  if (caller.role === "admin") {
    const { data: allChats } = await admin.from("chats").select("id");
    chatIds = (allChats ?? []).map((c: { id: string }) => c.id);
  } else {
    const { data: myP } = await admin
      .from("chat_participants").select("chat_id").eq("user_id", caller.id);
    chatIds = (myP ?? []).map((p: { chat_id: string }) => p.chat_id);
  }

  if (chatIds.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  // Carregar chats — inclui colunas denormalizadas last_message_*
  // (disponíveis após migração 037; NULL antes disso → fallback na secção de mensagens)
  const { data: chats } = await admin
    .from("chats")
    .select("id, type, name, post_policy, updated_at, status, archived_at, event_id, training_id, season_id, last_message_at, last_message_text, last_message_sys, last_message_card")
    .in("id", chatIds);

  // Eventos e treinos associados + participação do caller (em paralelo)
  const eventIds    = (chats ?? []).map((c: { event_id: string | null }) => c.event_id).filter(Boolean) as string[];
  const trainingIds = (chats ?? []).map((c: { training_id: string | null }) => c.training_id).filter(Boolean) as string[];

  const [eventsRes, trainingsRes, myParticipationRes, participantCountRes] = await Promise.all([
    eventIds.length > 0
      ? admin.from("events")
          .select("id, title, event_date, event_time, location, competition, opponent")
          .in("id", eventIds)
      : { data: [] },
    trainingIds.length > 0
      ? admin.from("trainings")
          .select("id, date, start_time, location, type")
          .in("id", trainingIds)
      : { data: [] },
    admin.from("chat_participants")
      .select("chat_id, user_id, last_read_at")
      .in("chat_id", chatIds),
    admin.from("chat_participants")
      .select("chat_id, user_id")
      .in("chat_id", chatIds),
  ]);

  type EventRow    = { id: string; title: string; event_date: string; event_time: string | null; location: string | null; competition: string | null; opponent: string | null };
  type TrainingRow = { id: string; date: string; start_time: string | null; location: string | null; type: string | null };
  type ParticipantRow = { chat_id: string; user_id: string; last_read_at?: string | null };

  const eventById   = new Map((eventsRes.data ?? []).map((e: EventRow) => [e.id, e]));
  const trainingById = new Map((trainingsRes.data ?? []).map((t: TrainingRow) => [t.id, t]));

  // last_read_at do caller por chat
  const lastReadByChat = new Map<string, string | null>();
  for (const p of (myParticipationRes.data ?? []) as ParticipantRow[]) {
    if (p.user_id === caller.id) lastReadByChat.set(p.chat_id, p.last_read_at ?? null);
  }

  // Contagem de participantes por chat
  const participantCountByChat = new Map<string, number>();
  for (const p of (participantCountRes.data ?? []) as ParticipantRow[]) {
    participantCountByChat.set(p.chat_id, (participantCountByChat.get(p.chat_id) ?? 0) + 1);
  }

  // ── Última mensagem e contagem de não-lidas ────────────────
  //
  // Estratégia em dois andares:
  //   1.º andar: usar colunas denormalizadas last_message_* nos chats (O(1))
  //              Disponíveis após migração 037 — o trigger mantém-nas atualizadas.
  //   2.º andar: se as colunas forem todas NULL (pré-migração ou chat sem msgs),
  //              cair de volta na query de mensagens (comportamento anterior).
  //
  // Para o unread count: sempre uma query lean (apenas sender_id + created_at,
  // sem content) limitada a 90 dias e às mensagens realmente relevantes.

  type ChatRow = {
    id: string; type: string; name: string | null; post_policy: string;
    updated_at: string; status: string; event_id: string | null; training_id: string | null;
    // Denormalized (disponível após migração 037)
    last_message_at?: string | null; last_message_text?: string | null;
    last_message_sys?: boolean | null; last_message_card?: string | null;
  };

  // Verificar se já temos dados denormalizados (pelo menos um chat com last_message_at)
  const hasDenormalized = (chats ?? []).some((c: ChatRow) => c.last_message_at != null);

  // Mapa de última mensagem por chat — preenchido via denormalized ou fallback
  type LastMsg = { content: string | null; created_at: string; is_system: boolean; card_type: string | null };
  const lastMsgByChat = new Map<string, LastMsg>();
  const unreadByChat  = new Map<string, number>();

  if (hasDenormalized) {
    // Caminho rápido: usar colunas da tabela chats (sem queries adicionais de mensagens)
    for (const c of (chats ?? []) as ChatRow[]) {
      if (c.last_message_at) {
        lastMsgByChat.set(c.id, {
          content:   c.last_message_text ?? null,
          created_at: c.last_message_at,
          is_system: c.last_message_sys ?? false,
          card_type: c.last_message_card ?? null,
        });
      }
    }

    // Unread: query lean — só sender_id + created_at, sem content
    // Cutoff: oldest last_read_at ou 90 dias (para chats nunca lidos)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const minLastRead = [...lastReadByChat.values()].reduce<string>((acc, lr) => {
      if (!lr) return acc;
      return lr < acc ? lr : acc;
    }, ninetyDaysAgo);

    const { data: unreadMsgs } = await admin
      .from("chat_messages")
      .select("chat_id, sender_id, created_at")
      .in("chat_id", chatIds)
      .neq("sender_id", caller.id)  // excluir mensagens próprias
      .neq("is_system", true)        // excluir mensagens de sistema
      .is("hidden_at", null)
      .gt("created_at", minLastRead)
      .order("created_at", { ascending: false })
      .limit(500);

    for (const m of (unreadMsgs ?? []) as Array<{ chat_id: string; sender_id: string | null; created_at: string }>) {
      const lr = lastReadByChat.get(m.chat_id);
      if (!lr || new Date(m.created_at) > new Date(lr)) {
        unreadByChat.set(m.chat_id, (unreadByChat.get(m.chat_id) ?? 0) + 1);
      }
    }
  } else {
    // Fallback (pré-migração): comportamento anterior mas com correção de unread
    const { data: messages } = await admin
      .from("chat_messages")
      .select("chat_id, sender_id, content, created_at, is_system, card_type")
      .in("chat_id", chatIds)
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.max(chatIds.length * 10, 100));

    type MsgRow = { chat_id: string; sender_id: string | null; content: string; created_at: string; is_system: boolean; card_type: string | null };
    for (const m of (messages ?? []) as MsgRow[]) {
      if (!lastMsgByChat.has(m.chat_id)) {
        lastMsgByChat.set(m.chat_id, { content: m.content, created_at: m.created_at, is_system: m.is_system, card_type: m.card_type });
      }
      // Excluir próprias e sistema do unread (bug fix vs comportamento anterior)
      if (m.sender_id === caller.id || m.is_system) continue;
      const lr = lastReadByChat.get(m.chat_id);
      if (!lr || new Date(m.created_at) > new Date(lr)) {
        unreadByChat.set(m.chat_id, (unreadByChat.get(m.chat_id) ?? 0) + 1);
      }
    }
  }

  // ── Nomes para chats diretos ───────────────────────────────
  const directIds = (chats ?? [])
    .filter((c: ChatRow) => c.type === "direct")
    .map((c: ChatRow) => c.id);

  const otherNameByChat = new Map<string, { name: string; user_id: string }>();
  if (directIds.length > 0) {
    const { data: dps } = await admin
      .from("chat_participants").select("chat_id, user_id").in("chat_id", directIds);
    type DPRow = { chat_id: string; user_id: string };
    const otherUsers = (dps ?? []).filter((p: DPRow) => p.user_id !== caller.id);
    const uids = [...new Set(otherUsers.map((p: DPRow) => p.user_id))];
    if (uids.length > 0) {
      const { data: users } = await admin.from("users").select("id, name").in("id", uids);
      const nameById = new Map((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]));
      for (const p of otherUsers as DPRow[]) {
        if (!otherNameByChat.has(p.chat_id)) {
          const n = nameById.get(p.user_id);
          if (n) otherNameByChat.set(p.chat_id, { name: n, user_id: p.user_id });
        }
      }
    }
  }

  // ── Convocatórias para fios de jogo ────────────────────────
  const gameEventIds = (chats ?? [])
    .filter((c: ChatRow) => c.type === "event" && c.event_id)
    .map((c: ChatRow) => c.event_id as string);

  const callupCountByEvent = new Map<string, { confirmed: number; total: number }>();
  if (gameEventIds.length > 0) {
    const { data: callups } = await admin
      .from("game_callups").select("game_id").in("game_id", gameEventIds);
    for (const eid of gameEventIds) {
      const count = (callups ?? []).filter((c: { game_id: string }) => c.game_id === eid).length;
      // Total = participantes do fio (staff + convocados) — sem query adicional
      const chat = (chats ?? []).find((c: ChatRow) => c.event_id === eid);
      const total = chat ? (participantCountByChat.get(chat.id) ?? 0) : 0;
      callupCountByEvent.set(eid, { confirmed: count, total });
    }
  }

  // ── Montar threads ─────────────────────────────────────────
  const threads = ((chats ?? []) as ChatRow[]).map((c) => {
    const lastMsg = lastMsgByChat.get(c.id);
    const base = {
      id: c.id,
      status: c.status,
      last_message: lastMsg
        ? {
            content:    lastMsg.is_system ? "(mensagem do sistema)" : (lastMsg.content ?? ""),
            sender_name: null as string | null,
            created_at:  lastMsg.created_at,
            is_system:   lastMsg.is_system,
            card_type:   lastMsg.card_type,
          }
        : null,
      unread_count:      unreadByChat.get(c.id) ?? 0,
      participant_count: participantCountByChat.get(c.id) ?? 0,
    };

    if (c.type === "event" && c.event_id) {
      const ev = eventById.get(c.event_id);
      const cu = callupCountByEvent.get(c.event_id);
      return {
        ...base,
        type: "event_game" as const,
        event_id:     c.event_id,
        event_date:   ev?.event_date ?? "",
        event_time:   ev?.event_time ?? null,
        event_title:  ev?.title ?? c.name ?? "Jogo",
        opponent:     ev?.opponent ?? null,
        competition:  ev?.competition ?? null,
        location:     ev?.location ?? null,
        callup_count: cu?.confirmed ?? 0,
        callup_total: cu?.total ?? 0,
        days_until:   ev ? daysUntil(ev.event_date) : null,
      };
    }

    if (c.type === "event" && c.training_id) {
      const tr = trainingById.get(c.training_id);
      return {
        ...base,
        type: "event_training" as const,
        training_id:   c.training_id,
        event_date:    tr?.date ?? "",
        event_time:    tr?.start_time ?? null,
        event_title:   c.name ?? "Treino",
        training_kind: tr?.type ?? null,
        location:      tr?.location ?? null,
        days_until:    tr ? daysUntil(tr.date) : null,
      };
    }

    if (c.type === "direct") {
      const other = otherNameByChat.get(c.id);
      return {
        ...base,
        type:          "direct" as const,
        name:          other?.name ?? "Conversa direta",
        other_user_id: other?.user_id ?? null,
        post_policy:   c.post_policy,
      };
    }

    return {
      ...base,
      type:        c.type as "team" | "staff" | "announcement" | "group",
      name:        c.name ?? c.type,
      post_policy: c.post_policy,
    };
  });

  // Ordenação: permanentes → eventos da semana → diretas → futuros → arquivados
  const today   = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  function sortKey(t: (typeof threads)[number]): number {
    if (t.status === "archived") return 4;
    if (t.type === "announcement" || t.type === "team" || t.type === "staff") return 0;
    if ((t.type === "event_game" || t.type === "event_training") && "event_date" in t) {
      const ed = t.event_date;
      if (ed >= today && ed <= weekEnd) return 1;
      return 3;
    }
    if (t.type === "direct") return 2;
    return 2;
  }

  threads.sort((a, b) => {
    const kDiff = sortKey(a) - sortKey(b);
    if (kDiff !== 0) return kDiff;
    const aDate = "event_date" in a ? a.event_date : (a.last_message?.created_at ?? "");
    const bDate = "event_date" in b ? b.event_date : (b.last_message?.created_at ?? "");
    return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
  });

  return NextResponse.json({ threads });
}

// ─── POST /api/chat/threads ─────────────────────────────────
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

    // Get-or-create idempotente
    const { data: myChats } = await admin
      .from("chat_participants").select("chat_id").eq("user_id", caller.id);
    const myChatIds = (myChats ?? []).map((c: { chat_id: string }) => c.chat_id);

    if (myChatIds.length > 0) {
      const { data: shared } = await admin
        .from("chat_participants").select("chat_id").eq("user_id", targetId).in("chat_id", myChatIds);
      for (const sc of (shared ?? []) as Array<{ chat_id: string }>) {
        const { data: cc } = await admin.from("chats").select("id, type").eq("id", sc.chat_id).single();
        if (cc?.type !== "direct") continue;
        const { count } = await admin
          .from("chat_participants").select("id", { count: "exact", head: true }).eq("chat_id", sc.chat_id);
        if (count === 2) return NextResponse.json({ chat_id: sc.chat_id, created: false });
      }
    }

    const { data: newChat, error } = await admin
      .from("chats").insert({ type: "direct", created_by: caller.id }).select("id").single();
    if (error || !newChat) return fail(error?.message ?? "Erro ao criar conversa", 500);

    await admin.from("chat_participants").insert([
      { chat_id: newChat.id, user_id: caller.id, role_in_chat: "member" },
      { chat_id: newChat.id, user_id: targetId, role_in_chat: "member" },
    ]);

    return NextResponse.json({ chat_id: newChat.id, created: true }, { status: 201 });
  }

  // group
  if (!canCreateGroup(callerRole)) return fail("Sem permissão para criar grupos", 403);
  if (!name?.trim()) return fail("Nome do grupo é obrigatório");

  const resolvedPostPolicy: ChatPostPolicy =
    callerRole === "admin" && post_policy === "admin_only" ? "admin_only" : "all";

  const memberIds = [...new Set(participant_ids.filter((id) => id !== caller.id))];
  if (memberIds.length === 0) return fail("Seleciona pelo menos um participante");

  const { data: newChat, error } = await admin
    .from("chats")
    .insert({ type: "group", name: name.trim(), created_by: caller.id, post_policy: resolvedPostPolicy })
    .select("id").single();
  if (error || !newChat) return fail(error?.message ?? "Erro ao criar grupo", 500);

  await admin.from("chat_participants").insert([
    { chat_id: newChat.id, user_id: caller.id, role_in_chat: "admin" },
    ...memberIds.map((user_id) => ({ chat_id: newChat.id, user_id, role_in_chat: "member" })),
  ]);

  return NextResponse.json({ chat_id: newChat.id, created: true }, { status: 201 });
}
