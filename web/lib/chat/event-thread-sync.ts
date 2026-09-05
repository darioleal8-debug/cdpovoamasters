import type { SupabaseClient } from "@supabase/supabase-js";

// ── helpers ──────────────────────────────────────────────────

async function addParticipants(
  admin: SupabaseClient,
  chatId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;
  const { data: existing } = await admin
    .from("chat_participants").select("user_id").eq("chat_id", chatId);
  const existingSet = new Set((existing ?? []).map((p: { user_id: string }) => p.user_id));
  const toAdd = userIds.filter((id) => !existingSet.has(id));
  if (toAdd.length > 0) {
    await admin.from("chat_participants").insert(
      toAdd.map((user_id) => ({ chat_id: chatId, user_id, role_in_chat: "member" }))
    );
  }
}

async function staffUserIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("users").select("id").in("role", ["admin", "treinador"]);
  return (data ?? []).map((u: { id: string }) => u.id);
}

async function insertSystemMessage(
  admin: SupabaseClient,
  chatId: string,
  content: string
): Promise<void> {
  await admin.from("chat_messages").insert({
    chat_id: chatId,
    sender_id: null,
    content,
    is_system: true,
  });
}

// ── Criar fio de jogo ────────────────────────────────────────

export async function ensureGameThread(
  admin: SupabaseClient,
  eventId: string
): Promise<string | null> {
  // Idempotente: se já existe, devolve o id
  const { data: existing } = await admin
    .from("chats").select("id").eq("event_id", eventId).maybeSingle();
  if (existing) return existing.id;

  const { data: event } = await admin
    .from("events")
    .select("id, title, event_date, event_time, season_id, competition")
    .eq("id", eventId).single();
  if (!event) return null;

  // Criar fio
  const { data: chat, error } = await admin
    .from("chats")
    .insert({
      type: "event",
      name: event.title,
      event_id: eventId,
      season_id: event.season_id,
      status: "active",
    })
    .select("id").single();

  if (error) {
    // Pode ter sido criado por pedido concorrente
    const { data: retry } = await admin
      .from("chats").select("id").eq("event_id", eventId).maybeSingle();
    return retry?.id ?? null;
  }

  // Participantes: staff + jogadores convocados com conta
  const staff = await staffUserIds(admin);

  const { data: callups } = await admin
    .from("game_callups")
    .select("player:players(user_id)")
    .eq("game_id", eventId);

  type CallupRow = { player: Array<{ user_id: string | null }> | null };
  const playerUserIds = ((callups ?? []) as CallupRow[])
    .flatMap((c) => c.player ?? [])
    .map((p) => p.user_id)
    .filter((id): id is string => !!id);

  await addParticipants(admin, chat.id, [...new Set([...staff, ...playerUserIds])]);

  // Mensagem de sistema inicial
  await insertSystemMessage(
    admin, chat.id,
    `Fio criado automaticamente quando o jogo foi agendado · ${staff.length + playerUserIds.length} participantes`
  );

  return chat.id;
}

// ── Criar fio de treino ───────────────────────────────────────

export async function ensureTrainingThread(
  admin: SupabaseClient,
  trainingId: string
): Promise<string | null> {
  const { data: existing } = await admin
    .from("chats").select("id").eq("training_id", trainingId).maybeSingle();
  if (existing) return existing.id;

  const { data: training } = await admin
    .from("trainings")
    .select("id, date, start_time, type, season_id, location")
    .eq("id", trainingId).single();
  if (!training) return null;

  const kindLabel: Record<string, string> = {
    geral: "Geral", tecnica: "Técnica", fisica: "Física",
    tatica: "Tática", jogo: "Jogo interno", mista: "Mista",
  };
  const label = kindLabel[training.type ?? "geral"] ?? (training.type ?? "Treino");
  const dateStr = new Date(training.date + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short",
  });
  const name = `Treino ${label} · ${dateStr}`;

  const { data: chat, error } = await admin
    .from("chats")
    .insert({
      type: "event",
      name,
      training_id: trainingId,
      season_id: training.season_id,
      status: "active",
    })
    .select("id").single();

  if (error) {
    const { data: retry } = await admin
      .from("chats").select("id").eq("training_id", trainingId).maybeSingle();
    return retry?.id ?? null;
  }

  const staff = await staffUserIds(admin);

  // Participantes: staff + jogadores com presenças registadas
  const { data: attendance } = await admin
    .from("training_attendances")
    .select("player:players(user_id)")
    .eq("training_id", trainingId);

  type AttRow = { player: Array<{ user_id: string | null }> | null };
  const attendeeIds = ((attendance ?? []) as AttRow[])
    .flatMap((a) => a.player ?? [])
    .map((p) => p.user_id)
    .filter((id): id is string => !!id);

  // Se não há presenças ainda, inclui todos os jogadores da temporada
  let playerIds = attendeeIds;
  if (playerIds.length === 0 && training.season_id) {
    const { data: players } = await admin
      .from("players")
      .select("user_id")
      .eq("season_id", training.season_id)
      .not("user_id", "is", null);
    playerIds = (players ?? []).map((p: { user_id: string | null }) => p.user_id).filter((id): id is string => !!id);
  }

  await addParticipants(admin, chat.id, [...new Set([...staff, ...playerIds])]);

  const total = new Set([...staff, ...playerIds]).size;
  await insertSystemMessage(
    admin, chat.id,
    `Fio criado automaticamente quando o treino foi agendado · ${total} participantes`
  );

  return chat.id;
}

// ── Sincronizar threads para jogos próximos ──────────────────
//
// Chamado no GET /api/chat/threads por staff/admin. Garante que todos os
// jogos dos próximos 60 dias (e os últimos 3 dias sem thread) têm um fio.
// Opera em batch para minimizar round-trips.
export async function syncGameEventChats(admin: SupabaseClient): Promise<void> {
  // Temporada ativa
  const { data: season } = await admin
    .from("seasons").select("id").eq("status", "ativa").single();
  if (!season) return;

  const today = new Date().toISOString().slice(0, 10);
  const cutoffPast   = new Date(Date.now() - 3  * 86_400_000).toISOString().slice(0, 10);
  const cutoffFuture = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  // Todos os jogos da janela
  const { data: events } = await admin
    .from("events")
    .select("id")
    .eq("season_id", season.id)
    .eq("type", "jogo")
    .gte("event_date", cutoffPast)
    .lte("event_date", cutoffFuture);

  if (!events || events.length === 0) return;

  const eventIds = events.map((e: { id: string }) => e.id);

  // Quais já têm thread
  const { data: existing } = await admin
    .from("chats")
    .select("event_id")
    .in("event_id", eventIds)
    .not("event_id", "is", null);

  const withThread = new Set((existing ?? []).map((c: { event_id: string }) => c.event_id));
  const missing = eventIds.filter((id) => !withThread.has(id));

  // Criar threads em falta (sequencial — idempotente)
  for (const eventId of missing) {
    await ensureGameThread(admin, eventId).catch(() => {/* ignora erros individuais */});
  }
}

// ── Arquivar fios com +3 dias após o evento ──────────────────

export async function archiveOldEventThreads(
  admin: SupabaseClient
): Promise<void> {
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  // Fios de jogo expirados
  const { data: gameChats } = await admin
    .from("chats")
    .select("id, event_id")
    .eq("type", "event")
    .eq("status", "active")
    .not("event_id", "is", null);

  for (const c of (gameChats ?? []) as Array<{ id: string; event_id: string }>) {
    const { data: event } = await admin
      .from("events").select("event_date").eq("id", c.event_id).single();
    if (event && event.event_date <= cutoff) {
      await admin.from("chats")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", c.id);
    }
  }

  // Fios de treino expirados
  const { data: trainingChats } = await admin
    .from("chats")
    .select("id, training_id")
    .eq("type", "event")
    .eq("status", "active")
    .not("training_id", "is", null);

  for (const c of (trainingChats ?? []) as Array<{ id: string; training_id: string }>) {
    const { data: training } = await admin
      .from("trainings").select("date").eq("id", c.training_id).single();
    if (training && training.date <= cutoff) {
      await admin.from("chats")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", c.id);
    }
  }
}
