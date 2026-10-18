import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { sendLatePaymentEmail } from "@/lib/email";
import { isLateReminderDay, LATE_REMINDER_DAY } from "@/lib/payments/late-reminder-schedule";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// GET — Vercel Cron (diário, vercel.json): só envia no dia do aviso mensal.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isLateReminderDay()) {
    return NextResponse.json({ ok: true, skipped: true, message: `Aviso só ao dia ${LATE_REMINDER_DAY}` });
  }
  return sendLateReminders();
}

// POST — disparo manual (com CRON_SECRET), em qualquer dia.
export async function POST(req: NextRequest) {
  // Fail-closed (QUO-04)
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return sendLateReminders();
}

async function sendLateReminders() {
  const db = adminClient();

  const { data: season } = await db
    .from("seasons")
    .select("id, name")
    .eq("status", "ativa")
    .maybeSingle();

  if (!season) {
    return NextResponse.json({ ok: true, message: "Nenhuma época ativa", sent: 0, failed: 0 });
  }

  type SummaryRow = { player_id: string; months_late: number; total_missing: number };
  const { data: summary, error: sumError } = await db
    .from("player_payment_summary")
    .select("player_id, months_late, total_missing")
    .eq("season_id", season.id)
    .gt("months_late", 0);

  if (sumError) {
    console.error("[cron/late-payments] Erro ao obter resumo:", sumError.message);
    return NextResponse.json({ error: sumError.message }, { status: 500 });
  }

  if (!summary?.length) {
    return NextResponse.json({ ok: true, message: "Nenhum jogador em atraso", sent: 0, failed: 0 });
  }

  const playerIds = (summary as SummaryRow[]).map((s) => s.player_id);

  const { data: players } = await db
    .from("players")
    .select("id, user_id")
    .in("id", playerIds);

  const playerUserMap = new Map<string, string>(
    (players ?? [])
      .filter((p: { id: string; user_id: string | null }) => p.user_id)
      .map((p: { id: string; user_id: string }) => [p.id, p.user_id])
  );

  const userIds = [...new Set(playerUserMap.values())];
  if (!userIds.length) {
    return NextResponse.json({ ok: true, message: "Nenhum utilizador ligado", sent: 0, failed: 0 });
  }

  const { data: users } = await db
    .from("users")
    .select("id, name, email")
    .in("id", userIds);

  const userInfoMap = new Map<string, { name: string; email: string }>(
    (users ?? [])
      .filter((u: { id: string; email: string | null }) => u.email)
      .map((u: { id: string; name: string; email: string }) => [u.id, { name: u.name, email: u.email }])
  );

  let sent = 0;
  let failed = 0;

  for (const s of summary as SummaryRow[]) {
    const userId = playerUserMap.get(s.player_id);
    if (!userId) continue;
    const userInfo = userInfoMap.get(userId);
    if (!userInfo) continue;

    const result = await sendLatePaymentEmail({
      to: userInfo.email,
      name: userInfo.name ?? "Jogador",
      monthsLate: s.months_late,
      totalMissing: s.total_missing ?? 0,
      seasonName: season.name,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
      console.error(`[cron/late-payments] Falha → ${userInfo.email}:`, result.error);
    }
  }

  console.log(`[cron/late-payments] Época=${season.name} | Total=${summary.length} | Enviados=${sent} | Falhas=${failed}`);
  return NextResponse.json({ ok: true, sent, failed, total: summary.length });
}
