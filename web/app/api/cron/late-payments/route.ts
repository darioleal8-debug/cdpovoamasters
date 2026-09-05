import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLatePaymentEmail } from "@/lib/email";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
