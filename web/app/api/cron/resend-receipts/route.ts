import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPaymentReceiptEmail } from "@/lib/email";

export const runtime    = "nodejs";
export const maxDuration = 60;

// GET /api/cron/resend-receipts
// Reenvia recibos que falharam há mais de 10 minutos.
// Invocar via Vercel Cron Jobs (vercel.json → crons) ou manualmente.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();

  // Recibos não enviados com mais de 10 minutos
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: unsent, error } = await admin
    .from("payment_receipts")
    .select(`
      id, player_id, payment_id, email, receipt_number,
      payment:player_payments!payment_id(amount, payment_date, method, month, reference_year, season_id)
    `)
    .is("sent_at", null)
    .lt("created_at", cutoff)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; sent: boolean; error?: string }> = [];

  for (const receipt of unsent ?? []) {
    type PaymentRow = {
      amount: number; payment_date: string | null; method: string | null;
      month: number; reference_year: number; season_id: string | null;
    };
    const paymentRaw = receipt.payment;
    const payment: PaymentRow | null = Array.isArray(paymentRaw)
      ? (paymentRaw[0] as PaymentRow ?? null)
      : (paymentRaw as unknown as PaymentRow | null);

    if (!receipt.email || !payment) {
      results.push({ id: receipt.id, sent: false, error: "dados incompletos" });
      continue;
    }

    // players.name foi removido na migration 041 — obter nome via v_roster
    const { data: rosterRow } = await admin
      .from("v_roster")
      .select("name")
      .eq("player_id", receipt.player_id)
      .maybeSingle();

    // Obter info de temporada e quotas pagas
    let clubName   = "CD Póvoa Masters";
    let temporada  = `${payment.reference_year}/${String(payment.reference_year + 1).slice(2)}`;
    let pagos      = 1;
    let totalMeses = 10;
    try {
      const { data: clubRow } = await admin.from("club_settings").select("club_name").limit(1).maybeSingle();
      if (clubRow?.club_name) clubName = clubRow.club_name;

      if (payment.season_id) {
        const { data: seasonRow } = await admin
          .from("seasons").select("name, start_date, end_date").eq("id", payment.season_id).single();
        if (seasonRow?.name) temporada = seasonRow.name;
        if (seasonRow?.start_date && seasonRow?.end_date) {
          const s = new Date(seasonRow.start_date), e = new Date(seasonRow.end_date);
          totalMeses = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
        }
        const { count } = await admin
          .from("player_payments")
          .select("id", { count: "exact", head: true })
          .eq("player_id", receipt.player_id)
          .eq("season_id", payment.season_id)
          .in("status", ["paid", "partial"]);
        if (count !== null) pagos = count;
      }
    } catch { /* não fatal — usa defaults */ }

    const nm = payment.month === 12 ? 1 : payment.month + 1;
    const ny = payment.month === 12 ? payment.reference_year + 1 : payment.reference_year;
    const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const proximaQuota = `1 de ${MESES[nm - 1]} de ${ny}`;

    // Usar receipt_number armazenado ou gerar fallback
    const receiptNum = (receipt as unknown as { receipt_number?: string }).receipt_number
      ?? `${payment.reference_year}-${String(payment.month).padStart(2,"0")}-???`;

    try {
      const r = await sendPaymentReceiptEmail({
        to:            receipt.email,
        name:          (rosterRow?.name ?? "Jogador").replace(/﻿/g, ""),
        month:         payment.month,
        year:          payment.reference_year,
        amount:        payment.amount,
        paymentDate:   payment.payment_date,
        method:        payment.method,
        receiptNumber: receiptNum,
        clubName, temporada, pagos, totalMeses, proximaQuota,
      });

      await admin.from("payment_receipts").update({
        sent_at: r.success ? new Date().toISOString() : null,
        error:   r.success ? null : (r.error ?? "Erro desconhecido"),
      }).eq("id", receipt.id);

      results.push({ id: receipt.id, sent: r.success, error: r.error });
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("payment_receipts").update({ error: msg }).eq("id", receipt.id);
      results.push({ id: receipt.id, sent: false, error: msg });
    }
  }

  const sent  = results.filter((r) => r.sent).length;
  const failed = results.filter((r) => !r.sent).length;
  console.log(`[cron/resend-receipts] ${sent} enviados, ${failed} falharam`);

  return NextResponse.json({ processed: results.length, sent, failed, results });
}
