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

const STAFF_ROLES = new Set(["admin", "treinador"]);
const CARD_TYPES = new Set(["callup_response", "poll", "transport", "attendance", "quota_reminder"]);

// POST /api/chat/threads/[chatId]/cards
// Body: { card_type: CardType; card_data: CardData; content?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId } = await params;

  let body: { card_type?: string; card_data?: Record<string, unknown>; content?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const { card_type, card_data, content = "" } = body;
  if (!card_type || !CARD_TYPES.has(card_type)) return fail("card_type inválido");
  if (!card_data) return fail("card_data obrigatório");

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("id, role").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  const { data: chat } = await admin
    .from("chats").select("id, type, status, post_policy").eq("id", chatId).single();
  if (!chat) return fail("Conversa não encontrada", 404);
  if (chat.status === "archived") return fail("Fio arquivado, só de leitura", 403);

  // Verificar participação
  if (caller.role !== "admin") {
    const { data: p } = await admin
      .from("chat_participants").select("id").eq("chat_id", chatId).eq("user_id", caller.id).maybeSingle();
    if (!p) return fail("Sem permissão nesta conversa", 403);
  }

  // Restrições por tipo de cartão
  if (card_type === "quota_reminder" && !STAFF_ROLES.has(caller.role)) {
    return fail("Só a equipa técnica pode enviar lembretes de quotas", 403);
  }
  if (card_type === "poll" && !STAFF_ROLES.has(caller.role)) {
    return fail("Só a equipa técnica pode criar sondagens", 403);
  }

  // Para cartão de resposta a convocatória: sincronizar com game_callups
  if (card_type === "callup_response" && card_data.player_id && card_data.response) {
    const { data: eventChat } = await admin
      .from("chats").select("event_id").eq("id", chatId).single();

    if (eventChat?.event_id) {
      const gameId = eventChat.event_id;
      const response = card_data.response as string;
      const playerId = card_data.player_id as string;

      // Verificar se o jogador está convocado
      const { data: callup } = await admin
        .from("game_callups").select("id, status").eq("game_id", gameId).eq("player_id", playerId).maybeSingle();

      if (callup) {
        const statusMap: Record<string, string> = {
          confirmed: "confirmado",
          doubt: "duvida",
          unavailable: "indisponivel",
        };
        const newStatus = statusMap[response];
        if (newStatus) {
          await admin.from("game_callups").update({ status: newStatus }).eq("id", callup.id);
        }
      }
    }
  }

  // Inserir cartão como mensagem
  const { data: message, error } = await admin
    .from("chat_messages")
    .insert({
      chat_id: chatId,
      sender_id: caller.id,
      sender_role: caller.role,
      content: content || card_type,
      card_type,
      card_data,
      is_system: false,
    })
    .select("id, chat_id, sender_id, sender_role, content, card_type, card_data, is_system, created_at")
    .single();

  if (error) return fail(error.message, 500);

  await admin.from("chat_message_reads").insert({ message_id: message.id, user_id: caller.id });
  await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

  return NextResponse.json({ message }, { status: 201 });
}
