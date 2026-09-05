import { createAdminClient } from "@/lib/supabase/server";
import { sendPaymentReceiptEmail } from "@/lib/email";

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTHS_PT_GENITIVO = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function nextQuotaLabel(month: number, year: number): string {
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  return `1 de ${MONTHS_PT_GENITIVO[nm - 1]} de ${ny}`;
}

// Gera número de recibo AAAA-MM-NNN.
// Usa MAX sobre os registos existentes — sequência por mês/ano global (todos os clubes).
async function generateReceiptNumber(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  year: number,
  month: number,
): Promise<string> {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  try {
    const { data } = await admin
      .from("payment_receipts")
      .select("receipt_number")
      .like("receipt_number", `${prefix}%`)
      .order("receipt_number", { ascending: false })
      .limit(1);
    const last  = data?.[0]?.receipt_number ?? null;
    const seq   = last ? (parseInt(last.slice(prefix.length)) || 0) + 1 : 1;
    return `${prefix}${String(seq).padStart(3, "0")}`;
  } catch {
    // Se a coluna ainda não existe, gera um número baseado em timestamp
    return `${prefix}${String(Date.now() % 1000).padStart(3, "0")}`;
  }
}

export type ReceiptNote =
  | "ok"
  | "dev"
  | "already_sent"
  | "sem_conta"
  | "sem_email"
  | "resend_error"
  | "error";

export interface ReceiptResult {
  sent:   boolean;
  note:   ReceiptNote;
  error?: string;
}

export async function sendAndLogPaymentReceipt(opts: {
  paymentId:     string;
  playerId:      string;
  month:         number;
  referenceYear: number;
  amount:        number;
  paymentDate:   string | null;
  method:        string | null;
}): Promise<ReceiptResult> {
  const { paymentId, playerId, month, referenceYear, paymentDate, method } = opts;
  let { amount } = opts;
  const tag = `[receipt:${paymentId.slice(0, 8)}]`;

  // ── 1. Admin client ─────────────────────────────────────────
  let admin: Awaited<ReturnType<typeof createAdminClient>>;
  try {
    admin = await createAdminClient();
  } catch (e) {
    const msg = `createAdminClient falhou: ${(e as Error).message}`;
    console.error(tag, msg);
    return { sent: false, note: "error", error: msg };
  }

  // ── 2. user_id do jogador (players.name e .email removidos na migration 041) ──
  const { data: playerRow, error: playerErr } = await admin
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .single();

  if (playerErr || !playerRow) {
    const msg = playerErr?.message ?? "Jogador não encontrado";
    console.warn(tag, "Jogador sem dados:", msg);
    return { sent: false, note: "error", error: msg };
  }

  // ── 3. Nome via v_roster ─────────────────────────────────────
  const { data: rosterRow } = await admin
    .from("v_roster")
    .select("name")
    .eq("player_id", playerId)
    .maybeSingle();
  const playerName = (rosterRow?.name ?? "Jogador").replace(/﻿/g, "");

  // ── 4. Email via auth.users ──────────────────────────────────
  let email: string | null = null;

  if (playerRow.user_id) {
    try {
      const { data: { user: authUser } } = await admin.auth.admin.getUserById(playerRow.user_id);
      email = authUser?.email ?? null;
      if (!email) {
        console.warn(tag, `auth.users sem email para user_id=${playerRow.user_id}`);
      }
    } catch (e) {
      console.warn(tag, "Falha ao consultar auth.users:", (e as Error).message);
    }
  }

  if (!email) {
    const note: ReceiptNote = playerRow.user_id ? "sem_email" : "sem_conta";
    console.warn(tag, `Jogador ${playerId} sem email (user_id: ${playerRow.user_id ?? "null"}) — nota: ${note}`);
    return { sent: false, note };
  }

  // ── 5. Verificação de duplicado + receipt_number existente ─────
  let existingReceiptNumber: string | null = null;
  try {
    const { data: existing } = await admin
      .from("payment_receipts")
      .select("sent_at, receipt_number")
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existing?.sent_at) {
      console.log(tag, `Recibo já enviado anteriormente para ${email}`);
      return { sent: true, note: "already_sent" };
    }
    existingReceiptNumber = existing?.receipt_number ?? null;
  } catch {
    console.warn(tag, "payment_receipts inacessível — a continuar sem verificação de duplicado");
  }

  // ── 6. Gerar receipt_number se ainda não existe ──────────────
  const receiptNumber = existingReceiptNumber
    ?? await generateReceiptNumber(admin, referenceYear, month);

  // ── 7. Obter info de temporada e quotas pagas ─────────────────
  let clubName   = "CD Póvoa Masters";
  let temporada  = `${referenceYear}/${String(referenceYear + 1).slice(2)}`;
  let pagos      = 1;
  let totalMeses = 10;

  try {
    // Obter club_settings para nome do clube
    const { data: clubRow } = await admin
      .from("club_settings")
      .select("club_name")
      .limit(1)
      .maybeSingle();
    if (clubRow?.club_name) clubName = clubRow.club_name;

    // Obter season_id e amount_due do pagamento
    const { data: payRow } = await admin
      .from("player_payments")
      .select("season_id, amount_due")
      .eq("id", paymentId)
      .single();

    // Se amount=0 mas amount_due>0, usar amount_due (pagamento marcado como pago sem valor)
    if (amount === 0 && (payRow?.amount_due ?? 0) > 0) {
      amount = payRow!.amount_due;
    }

    if (payRow?.season_id) {
      // Nome da temporada
      const { data: seasonRow } = await admin
        .from("seasons")
        .select("name, start_date, end_date")
        .eq("id", payRow.season_id)
        .single();

      if (seasonRow) {
        if (seasonRow.name) temporada = seasonRow.name;
        // Total de meses = diferença entre start_date e end_date (inclusivo)
        if (seasonRow.start_date && seasonRow.end_date) {
          const start = new Date(seasonRow.start_date);
          const end   = new Date(seasonRow.end_date);
          totalMeses  = Math.max(1,
            (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth()) + 1
          );
        }
      }

      // Contar quotas pagas para este jogador nesta temporada
      const { count } = await admin
        .from("player_payments")
        .select("id", { count: "exact", head: true })
        .eq("player_id", playerId)
        .eq("season_id", payRow.season_id)
        .in("status", ["paid", "partial"]);
      if (count !== null) pagos = count;
    }
  } catch (e) {
    console.warn(tag, "Não foi possível obter info de temporada:", (e as Error).message);
  }

  const proximaQuota = nextQuotaLabel(month, referenceYear);

  // ── 8. ENVIAR EMAIL ─────────────────────────────────────────
  console.log(tag, `A enviar recibo para ${email} (${playerName}) — mês ${month}/${referenceYear} — recibo ${receiptNumber}`);

  let sendResult: Awaited<ReturnType<typeof sendPaymentReceiptEmail>>;
  try {
    sendResult = await sendPaymentReceiptEmail({
      to: email, name: playerName,
      month, year: referenceYear,
      amount, paymentDate, method,
      receiptNumber, clubName, temporada, pagos, totalMeses, proximaQuota,
    });
  } catch (e) {
    const msg = `Exceção no envio: ${(e as Error).message}`;
    console.error(tag, msg);
    sendResult = { success: false, error: msg };
  }

  const emailOk = sendResult.success || !!sendResult.devFallback;

  if (emailOk) {
    console.log(tag, `✓ Email enviado para ${email}${sendResult.devFallback ? " (dev-fallback, não enviado realmente)" : ""}`);
  } else {
    console.error(tag, `✗ Falha no envio para ${email}:`, sendResult.error);
  }

  // ── 9. Registar em payment_receipts (não-fatal) ─────────────
  try {
    await admin.from("payment_receipts").upsert(
      {
        player_id:      playerId,
        payment_id:     paymentId,
        email,
        receipt_number: receiptNumber,
        sent_at:        emailOk ? new Date().toISOString() : null,
        error:          emailOk ? null : (sendResult.error ?? "Erro desconhecido"),
      },
      { onConflict: "payment_id", ignoreDuplicates: false }
    );
  } catch (e) {
    console.warn(tag, "Não foi possível registar em payment_receipts:", (e as Error).message);
  }

  // ── 10. Atualizar player_payments.receipt_sent (não-fatal) ────
  try {
    await admin
      .from("player_payments")
      .update({
        receipt_sent:    emailOk,
        receipt_sent_at: emailOk ? new Date().toISOString() : null,
        receipt_error:   emailOk ? null : (sendResult.error ?? "Erro desconhecido"),
      })
      .eq("id", paymentId);
  } catch (e) {
    // Colunas ainda não existem (migração 026 não correu) — não-fatal
    console.warn(tag, "Não foi possível atualizar receipt_sent em player_payments:", (e as Error).message);
  }

  // ── 11. Resultado ────────────────────────────────────────────
  if (sendResult.devFallback) return { sent: true,  note: "dev" };
  if (sendResult.success)     return { sent: true,  note: "ok" };
  return { sent: false, note: "resend_error", error: sendResult.error };
}
