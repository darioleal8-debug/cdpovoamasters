import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garante (idempotente) que existe um chat de tipo 'staff' (#equipa-técnica)
 * com todos os utilizadores admin e treinador como participantes.
 */
export async function ensureStaffChat(admin: SupabaseClient): Promise<string | null> {
  let chat: { id: string } | null = null;

  const { data: existing } = await admin
    .from("chats").select("id").eq("type", "staff").maybeSingle();

  if (existing) {
    chat = existing;
  } else {
    const { data: created, error } = await admin
      .from("chats")
      .insert({ type: "staff", name: "#equipa-técnica", post_policy: "all" })
      .select("id").single();

    if (error) {
      const { data: retry } = await admin
        .from("chats").select("id").eq("type", "staff").maybeSingle();
      chat = retry;
    } else {
      chat = created;
    }
  }

  if (!chat) return null;

  const { data: staff } = await admin
    .from("users").select("id").in("role", ["admin", "treinador"]);
  const staffIds = (staff ?? []).map((u: { id: string }) => u.id);

  const { data: existingP } = await admin
    .from("chat_participants").select("user_id").eq("chat_id", chat.id);
  const existingSet = new Set((existingP ?? []).map((p: { user_id: string }) => p.user_id));

  const toAdd = staffIds.filter((id) => !existingSet.has(id));
  if (toAdd.length > 0) {
    await admin.from("chat_participants").insert(
      toAdd.map((user_id) => ({ chat_id: chat!.id, user_id, role_in_chat: "member" }))
    );
  }

  return chat.id;
}
