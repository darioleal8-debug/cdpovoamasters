import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabase
    .from("player_payments")
    .select("*, player:players(id, name, number)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ payment: data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Buscar estado anterior para auditoria
  const { data: before } = await supabase
    .from("player_payments")
    .select("amount, amount_due, status, method, notes, payment_date")
    .eq("id", id)
    .single();

  // Não permitir alterar chaves únicas via PUT
  const { season_id: _s, player_id: _p, created_by: _c, created_at: _ca, ...allowed } = body;

  const { data, error } = await supabase
    .from("player_payments")
    .update(allowed)
    .eq("id", id)
    .select("*, player:players(id, name, number)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  return NextResponse.json({ payment: data });
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
