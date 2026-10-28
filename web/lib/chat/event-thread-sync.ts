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

// ── Fios de jogo (conversa de grupo por jogo do clube) ───────
//
// Regra: a conversa abre 7 dias antes do jogo e fecha 2 dias depois, com todos
// os jogadores e staff. A lógica vive na BD (função sync_game_chats, migração
// 115) para ser executada também pelo pg_cron, sem depender de ninguém abrir
// a app. Aqui só a invocamos.

let _lastGameSync = 0;
const GAME_SYNC_MIN_INTERVAL_MS = 60_000;

/** Cria/atualiza/fecha as conversas de jogo. Idempotente e barata. */
export async function syncGameEventChats(
  admin: SupabaseClient,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (!opts.force && Date.now() - _lastGameSync < GAME_SYNC_MIN_INTERVAL_MS) return;
  _lastGameSync = Date.now();
  const { error } = await admin.rpc("sync_game_chats");
  if (error) {
    _lastGameSync = 0; // permitir nova tentativa no próximo pedido
    throw new Error(error.message);
  }
}

/**
 * Devolve o id da conversa do jogo, se estiver dentro da janela
 * (7 dias antes → 2 dias depois). Fora da janela devolve null.
 */
export async function ensureGameThread(
  admin: SupabaseClient,
  eventId: string
): Promise<string | null> {
  await syncGameEventChats(admin, { force: true });
  const { data } = await admin
    .from("chats").select("id").eq("event_id", eventId).maybeSingle();
  return data?.id ?? null;
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
    .from("training_attendance")
    .select("player:players(user_id)")
    .eq("training_id", trainingId)
    .in("status", ["present", "late"]);

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

// ── Sincronizar threads para treinos próximos ─────────────────
//
// Chamado no GET /api/chat/threads para todos os utilizadores. Garante que
// todos os treinos dos próximos 60 dias (e dos últimos 3 dias) têm fio.
export async function syncTrainingEventChats(admin: SupabaseClient): Promise<void> {
  const { data: season } = await admin
    .from("seasons").select("id").eq("status", "ativa").single();
  if (!season) return;

  const cutoffPast   = new Date(Date.now() - 3  * 86_400_000).toISOString().slice(0, 10);
  const cutoffFuture = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const { data: trainings } = await admin
    .from("trainings")
    .select("id")
    .eq("season_id", season.id)
    .gte("date", cutoffPast)
    .lte("date", cutoffFuture);

  if (!trainings || trainings.length === 0) return;

  const trainingIds = trainings.map((t: { id: string }) => t.id);

  const { data: existing } = await admin
    .from("chats")
    .select("training_id")
    .in("training_id", trainingIds)
    .not("training_id", "is", null);

  const withThread = new Set((existing ?? []).map((c: { training_id: string }) => c.training_id));
  const missing = trainingIds.filter((id) => !withThread.has(id));

  for (const trainingId of missing) {
    await ensureTrainingThread(admin, trainingId).catch(() => {/* ignora erros individuais */});
  }
}

// ── Garantir que um jogador está em todos os threads de treino ─
//
// Corre em GET /api/chat/threads para utilizadores não-staff. Resolve o caso
// em que o thread foi criado antes do player.user_id ser ligado ao registo
// de jogador — esses jogadores nunca foram adicionados como participantes.
export async function ensurePlayerInTrainingThreads(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: season } = await admin
    .from("seasons").select("id").eq("status", "ativa").single();
  if (!season) return;

  // Todos os threads de treino da temporada activa
  const { data: trainingChats } = await admin
    .from("chats")
    .select("id")
    .eq("season_id", season.id)
    .eq("type", "event")
    .eq("status", "active")
    .not("training_id", "is", null);

  if (!trainingChats || trainingChats.length === 0) return;

  const chatIds = trainingChats.map((c: { id: string }) => c.id);

  // Quais destes já têm o player como participante
  const { data: existing } = await admin
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", userId)
    .in("chat_id", chatIds);

  const alreadyIn = new Set((existing ?? []).map((p: { chat_id: string }) => p.chat_id));
  const missing = chatIds.filter((id) => !alreadyIn.has(id));

  if (missing.length === 0) return;

  await admin.from("chat_participants").insert(
    missing.map((chat_id) => ({ chat_id, user_id: userId, role_in_chat: "member" }))
  );
}

// ── Arquivar fios com +3 dias após o evento ──────────────────

export async function archiveOldEventThreads(
  admin: SupabaseClient
): Promise<void> {
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  // Fios de jogo: fecho (+2 dias) tratado por sync_game_chats
  await syncGameEventChats(admin, { force: true });

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
