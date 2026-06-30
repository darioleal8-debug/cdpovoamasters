import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garante (idempotente) que existe um chat de tipo 'team' para a
 * temporada ativa, com admins + treinadores + jogadores ligados
 * (players.user_id) como participantes. Remoção de membros obsoletos
 * fica para a Fase 2.
 */
export async function syncTeamChat(admin: SupabaseClient): Promise<string | null> {
  const { data: season } = await admin
    .from("seasons")
    .select("id, name")
    .eq("status", "ativa")
    .single();
  if (!season) return null;

  let chat: { id: string } | null = null;

  const { data: existingChat } = await admin
    .from("chats")
    .select("id")
    .eq("type", "team")
    .eq("season_id", season.id)
    .maybeSingle();

  if (existingChat) {
    chat = existingChat;
  } else {
    const { data: created, error } = await admin
      .from("chats")
      .insert({ type: "team", name: `Equipa ${season.name}`, season_id: season.id })
      .select("id")
      .single();

    if (error) {
      // Índice único pode ter sido preenchido por um pedido concorrente.
      const { data: refetched } = await admin
        .from("chats")
        .select("id")
        .eq("type", "team")
        .eq("season_id", season.id)
        .maybeSingle();
      if (!refetched) return null;
      chat = refetched;
    } else {
      chat = created;
    }
  }

  if (!chat) return null;

  const { data: staff } = await admin
    .from("users")
    .select("id")
    .in("role", ["admin", "treinador"]);

  const { data: players } = await admin
    .from("players")
    .select("user_id")
    .eq("season_id", season.id)
    .not("user_id", "is", null);

  const desiredIds = new Set<string>([
    ...(staff ?? []).map((u) => u.id as string),
    ...(players ?? []).map((p) => p.user_id as string),
  ]);

  const { data: existingParticipants } = await admin
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat.id);
  const existingIds = new Set((existingParticipants ?? []).map((p) => p.user_id as string));

  const toAdd = [...desiredIds].filter((id) => !existingIds.has(id));
  if (toAdd.length > 0) {
    await admin.from("chat_participants").insert(
      toAdd.map((user_id) => ({ chat_id: chat!.id, user_id, role_in_chat: "member" }))
    );
  }

  return chat.id;
}

/**
 * Garante (idempotente) que existe o chat global 'Comunicados' e que
 * todos os utilizadores ativos têm um registo de participante (para que
 * o cálculo de não-lidas via last_read_at funcione tal como nos outros
 * tipos de chat).
 */
export async function syncAnnouncementChat(admin: SupabaseClient): Promise<string> {
  let chat: { id: string } | null = null;

  const { data: existingChat } = await admin
    .from("chats")
    .select("id")
    .eq("type", "announcement")
    .maybeSingle();

  if (existingChat) {
    chat = existingChat;
  } else {
    const { data: created, error } = await admin
      .from("chats")
      .insert({ type: "announcement", name: "Comunicados", post_policy: "admin_only" })
      .select("id")
      .single();

    if (error) {
      const { data: refetched } = await admin
        .from("chats")
        .select("id")
        .eq("type", "announcement")
        .maybeSingle();
      chat = refetched;
    } else {
      chat = created;
    }
  }

  if (!chat) throw new Error("Não foi possível criar o chat de Comunicados");

  const { data: allUsers } = await admin.from("users").select("id").eq("active", true);
  const { data: existingParticipants } = await admin
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chat.id);
  const existingIds = new Set((existingParticipants ?? []).map((p) => p.user_id as string));

  const toAdd = (allUsers ?? [])
    .map((u) => u.id as string)
    .filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await admin.from("chat_participants").insert(
      toAdd.map((user_id) => ({ chat_id: chat!.id, user_id, role_in_chat: "member" }))
    );
  }

  return chat.id;
}
