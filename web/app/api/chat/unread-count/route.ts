import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
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

type UnreadChat = { chat_id: string; name: string; unread: number };

// Cálculo anterior (aproximado: janela de 90 dias, máx. 500 mensagens).
// Só é usado se a função SQL chat_unread_counts (migração 115) ainda não existir.
async function legacyUnread(
  admin: ReturnType<typeof adminClient>,
  userId: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data: participation } = await admin
    .from("chat_participants")
    .select("chat_id, last_read_at")
    .eq("user_id", userId);
  if (!participation || participation.length === 0) return out;

  const chatIds = participation.map((p) => p.chat_id as string);
  const lastReadByChat = new Map(participation.map((p) => [p.chat_id as string, p.last_read_at as string | null]));
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const minLastRead = participation.reduce<string>((acc, p) => {
    const lr = p.last_read_at as string | null;
    if (!lr) return acc;
    return lr < acc ? lr : acc;
  }, ninetyDaysAgo);

  const { data: messages } = await admin
    .from("chat_messages")
    .select("chat_id, created_at, sender_id")
    .in("chat_id", chatIds)
    .gt("created_at", minLastRead)
    .neq("is_system", true)
    .order("created_at", { ascending: false })
    .limit(500);

  for (const m of messages ?? []) {
    if ((m.sender_id as string | null) === userId) continue;
    const lastRead = lastReadByChat.get(m.chat_id as string);
    if (!lastRead || new Date(m.created_at as string) > new Date(lastRead)) {
      out.set(m.chat_id as string, (out.get(m.chat_id as string) ?? 0) + 1);
    }
  }
  return out;
}

// ─── GET /api/chat/unread-count ─────────────────────────────
// Endpoint leve para badges e notificações — não devolve pré-visualizações.
// { unread_count, chats: [{ chat_id, name, unread }] }
export async function GET() {
  // Sessão + conta ativa (revisão final, Crítico 1); as verificações de papel abaixo mantêm-se
  const authz = await authorize();
  if (!authz.ok) return authz.response;
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("id").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  // Contagem exata por conversa (conversas fechadas não contam)
  let byChat = new Map<string, number>();
  const { data: exact, error: exactErr } = await admin.rpc("chat_unread_counts", { p_user: caller.id });
  if (!exactErr && Array.isArray(exact)) {
    for (const r of exact as Array<{ chat_id: string; unread: number | string }>) {
      byChat.set(r.chat_id, Number(r.unread));
    }
  } else {
    byChat = await legacyUnread(admin, caller.id);
  }

  if (byChat.size === 0) {
    return NextResponse.json({ unread_count: 0, chats: [] });
  }

  // Nomes das conversas com mensagens por ler (para a notificação)
  const ids = [...byChat.keys()];
  const { data: chatRows } = await admin
    .from("chats").select("id, type, name").in("id", ids);

  const directIds = (chatRows ?? []).filter((c) => c.type === "direct").map((c) => c.id as string);
  const otherName = new Map<string, string>();
  if (directIds.length > 0) {
    const { data: parts } = await admin
      .from("chat_participants").select("chat_id, user_id").in("chat_id", directIds).neq("user_id", caller.id);
    const uids = [...new Set((parts ?? []).map((p) => p.user_id as string))];
    if (uids.length > 0) {
      const { data: users } = await admin.from("users").select("id, name").in("id", uids);
      const nameById = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));
      for (const p of parts ?? []) {
        const n = nameById.get(p.user_id as string);
        if (n && !otherName.has(p.chat_id as string)) otherName.set(p.chat_id as string, n);
      }
    }
  }

  const chats: UnreadChat[] = (chatRows ?? []).map((c) => ({
    chat_id: c.id as string,
    name: c.type === "direct" ? (otherName.get(c.id as string) ?? "Conversa direta") : ((c.name as string | null) ?? "Chat"),
    unread: byChat.get(c.id as string) ?? 0,
  })).filter((c) => c.unread > 0);

  const unread_count = chats.reduce((sum, c) => sum + c.unread, 0);
  return NextResponse.json({ unread_count, chats });
}
