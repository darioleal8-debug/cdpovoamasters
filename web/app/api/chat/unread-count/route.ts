import { NextResponse } from "next/server";
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

// ─── GET /api/chat/unread-count ─────────────────────────────
// Endpoint leve para badges nas sidebars — não devolve pré-visualizações.
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("id").eq("id", authUser.id).single();
  if (!caller) return fail("Perfil não encontrado", 404);

  const { data: participation } = await admin
    .from("chat_participants")
    .select("chat_id, last_read_at")
    .eq("user_id", caller.id);

  if (!participation || participation.length === 0) {
    return NextResponse.json({ unread_count: 0 });
  }

  const chatIds = participation.map((p) => p.chat_id as string);
  const lastReadByChat = new Map(participation.map((p) => [p.chat_id as string, p.last_read_at as string | null]));

  // Ponto mais antigo de last_read_at — só buscamos mensagens mais recentes
  // Não lidas podem existir em chats onde last_read_at é NULL (jamais lidos)
  // Para esses, usamos cutoff de 90 dias para não carregar o histórico todo.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const minLastRead = participation.reduce<string>((acc, p) => {
    const lr = p.last_read_at as string | null;
    if (!lr) return acc; // chat sem last_read — já temos cutoff de 90 dias
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

  let unread = 0;
  for (const m of messages ?? []) {
    // Não contar mensagens enviadas pelo próprio utilizador
    if ((m.sender_id as string | null) === caller.id) continue;
    const lastRead = lastReadByChat.get(m.chat_id as string);
    if (!lastRead || new Date(m.created_at as string) > new Date(lastRead)) unread++;
  }

  return NextResponse.json({ unread_count: unread });
}
