import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureGameThread, ensureTrainingThread, archiveOldEventThreads } from "@/lib/chat/event-thread-sync";

export const runtime = "nodejs";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// POST /api/chat/event-sync
// Body: { event_id?: string; training_id?: string; action?: "archive_old" }
// Chamado: criação de evento/treino, job de arquivamento
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  let body: { event_id?: string; training_id?: string; action?: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const admin = adminClient();

  if (body.action === "archive_old") {
    await archiveOldEventThreads(admin);
    return NextResponse.json({ ok: true });
  }

  if (body.event_id) {
    const chatId = await ensureGameThread(admin, body.event_id);
    if (!chatId) return fail("Evento não encontrado", 404);
    return NextResponse.json({ chat_id: chatId });
  }

  if (body.training_id) {
    const chatId = await ensureTrainingThread(admin, body.training_id);
    if (!chatId) return fail("Treino não encontrado", 404);
    return NextResponse.json({ chat_id: chatId });
  }

  return fail("Fornecer event_id, training_id ou action");
}
