import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAndLogPaymentReceipt } from "@/lib/payment-receipt";

// players.name foi removido na migration 041 — usar v_roster para obter nome
async function enrichPayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payment: { player_id: string; [key: string]: unknown }
) {
  const { data: r } = await supabase
    .from("v_roster")
    .select("player_id, name, number")
    .eq("player_id", payment.player_id)
    .maybeSingle();
  return { ...payment, player: r ? { id: r.player_id, name: r.name, number: r.number } : null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabase
    .from("player_payments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const payment = await enrichPayment(supabase, data as { player_id: string; [key: string]: unknown });
  return NextResponse.json({ payment });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Buscar estado anterior para auditoria e lógica de recibo
  const { data: before } = await supabase
    .from("player_payments")
    .select("amount, amount_due, status, method, notes, payment_date, player_id, month, reference_year")
    .eq("id", id)
    .single();

  // Não permitir alterar chaves únicas via PUT
  const { season_id: _s, player_id: _p, created_by: _c, created_at: _ca, ...allowed } = body;

  const { data, error } = await supabase
    .from("player_payments")
    .update(allowed)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payment = await enrichPayment(supabase, data as { player_id: string; [key: string]: unknown });

  // Registar histórico se houve alteração real
  if (before) {
    const changed =
      before.amount       !== (allowed.amount       ?? before.amount)       ||
      before.amount_due   !== (allowed.amount_due   ?? before.amount_due)   ||
      before.status       !== (allowed.status       ?? before.status)       ||
      before.method       !== (allowed.method       ?? before.method)       ||
      before.notes        !== (allowed.notes        ?? before.notes)        ||
      before.payment_date !== (allowed.payment_date ?? before.payment_date);

    if (changed) {
      await supabase.from("player_payments_history").insert({
        payment_id:      id,
        changed_by:      user.id,
        old_amount:      before.amount,
        old_amount_due:  before.amount_due,
        old_status:      before.status,
        old_method:      before.method,
        old_notes:       before.notes,
        old_payment_date:before.payment_date,
        new_amount:      data.amount,
        new_amount_due:  data.amount_due,
        new_status:      data.status,
        new_method:      data.method,
        new_notes:       data.notes,
        new_payment_date:data.payment_date,
      });
    }
  }

  // Enviar recibo se o status transitou para "pago"
  let receipt_sent  = false;
  let receipt_note  = "";
  let receipt_error: string | undefined;
  const newStatus = allowed.status ?? before?.status;

  if (newStatus === "paid" && before?.status !== "paid") {
    console.log(`[player-payments PUT] Pagamento ${id} marcado como pago — a enviar recibo`);
    const r = await sendAndLogPaymentReceipt({
      paymentId:     id,
      playerId:      before!.player_id,
      month:         Number(before!.month),
      referenceYear: Number(before!.reference_year),
      amount:        data.amount,
      paymentDate:   data.payment_date ?? null,
      method:        data.method ?? null,
    });
    receipt_sent  = r.sent;
    receipt_note  = r.note;
    receipt_error = r.error;
    console.log(`[player-payments PUT] Resultado recibo: sent=${r.sent} note=${r.note}${r.error ? ` error=${r.error}` : ""}`);
  }

  return NextResponse.json({ payment, receipt_sent, receipt_note, receipt_error });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("player_payments")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
