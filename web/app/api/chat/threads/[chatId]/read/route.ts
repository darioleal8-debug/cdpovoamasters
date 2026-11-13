import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { authorize } from "@/lib/auth/guards";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function adminClient() {
  return createServiceClient(); // isolado por clube (ver lib/supabase/club-scope.ts)
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

// ─── POST /api/chat/threads/[chatId]/read ─────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  // Sessão + conta ativa (revisão final, Crítico 1); as verificações de papel abaixo mantêm-se
  const authz = await authorize();
  if (!authz.ok) return authz.response;
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { chatId } = await params;
  const admin = adminClient();

  const { data: participant } = await admin
    .from("chat_participants")
    .select("id")
    .eq("chat_id", chatId)
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (!participant) return fail("Não és participante desta conversa", 403);

  const { error } = await admin
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", participant.id);
  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}
