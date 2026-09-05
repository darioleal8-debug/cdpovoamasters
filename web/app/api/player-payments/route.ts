import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendAndLogPaymentReceipt } from "@/lib/payment-receipt";

// players.name foi removido na migration 041 — usar v_roster para obter nome
async function enrichPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payments: { player_id: string; [key: string]: unknown }[]
) {
  if (!payments.length) return payments.map((p) => ({ ...p, player: null }));
  const ids = [...new Set(payments.map((p) => p.player_id))];
  const { data: roster } = await supabase
    .from("v_roster")
    .select("player_id, name, number")
    .in("player_id", ids);
  const byId = new Map((roster ?? []).map((r) => [r.player_id as string, r]));
  return payments.map((p) => {
    const r = byId.get(p.player_id);
    return { ...p, player: r ? { id: r.player_id, name: r.name, number: r.number } : null };
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const season_id = sp.get("season_id");
  const player_id = sp.get("player_id");
  const month     = sp.get("month");
  const year      = sp.get("year");
  const status    = sp.get("status");

  let query = supabase
    .from("player_payments")
    .select("*")
    .order("reference_year", { ascending: true })
    .order("month",          { ascending: true });

  if (season_id) query = query.eq("season_id", season_id);
  if (player_id) query = query.eq("player_id", player_id);
  if (month)     query = query.eq("month",          parseInt(month));
  if (year)      query = query.eq("reference_year", parseInt(year));
  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const payments = await enrichPayments(supabase, (data ?? []) as { player_id: string; [key: string]: unknown }[]);
  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { season_id, player_id: bodyPlayerId, user_id, month, reference_year, amount, amount_due, status, method, notes, payment_date } = body;

  if (!season_id || !month || !reference_year) {
    return NextResponse.json(
      { error: "season_id, month e reference_year são obrigatórios" },
      { status: 400 }
    );
  }

  // Resolver player_id: se não foi enviado mas user_id está disponível,
  // encontrar ou criar o registo de jogador para esta época.
  let player_id = bodyPlayerId as string | null;
  if (!player_id && user_id && season_id) {
    try {
      const admin = await createAdminClient();
      const { data: existingPlayer } = await admin
        .from("players")
        .select("id")
        .eq("user_id", user_id)
        .eq("season_id", season_id)
        .maybeSingle();

      if (existingPlayer) {
        player_id = existingPlayer.id as string;
      } else {
        const { data: newPlayer, error: createErr } = await admin
          .from("players")
          .insert({ user_id, season_id })
          .select("id")
          .single();
        if (createErr) throw new Error(createErr.message);
        player_id = newPlayer!.id as string;
      }
    } catch (e) {
      return NextResponse.json(
        { error: `Não foi possível criar o perfil de jogador: ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  if (!player_id) {
    return NextResponse.json(
      { error: "player_id ou user_id são obrigatórios" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("player_payments")
    .upsert(
      {
        season_id,
        player_id,
        month,
        reference_year,
        amount:       amount       ?? 0,
        amount_due:   amount_due   ?? 20,
        status:       status       ?? "paid",
        method:       (method && method !== "none" ? method : null) as string | null,
        notes:        notes        || null,
        payment_date: payment_date || null,
        created_by:   user.id,
      },
      { onConflict: "season_id,player_id,month,reference_year" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [payment] = await enrichPayments(supabase, [data as { player_id: string; [key: string]: unknown }]);

  // Enviar recibo por email (apenas quando o pagamento fica "pago")
  let receipt_sent  = false;
  let receipt_note  = "";
  let receipt_error: string | undefined;
  const finalStatus = status ?? "paid";

  if (finalStatus === "paid") {
    console.log(`[player-payments POST] Pagamento ${data.id} registado — a enviar recibo`);
    const r = await sendAndLogPaymentReceipt({
      paymentId:     data.id,
      playerId:      player_id,
      month:         Number(month),
      referenceYear: Number(reference_year),
      amount:        data.amount,
      paymentDate:   data.payment_date ?? null,
      method:        data.method ?? null,
    });
    receipt_sent  = r.sent;
    receipt_note  = r.note;
    receipt_error = r.error;
    console.log(`[player-payments POST] Resultado recibo: sent=${r.sent} note=${r.note}${r.error ? ` error=${r.error}` : ""}`);
  }

  return NextResponse.json({ payment, receipt_sent, receipt_note, receipt_error }, { status: 201 });
}
