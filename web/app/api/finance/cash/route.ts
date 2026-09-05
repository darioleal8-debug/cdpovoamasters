import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const sp   = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to   = sp.get("to");

  let q = admin
    .from("financial_cash_movements")
    .select("*")
    .order("movement_date", { ascending: false })
    .order("created_at",    { ascending: false });

  if (from) q = q.gte("movement_date", from);
  if (to)   q = q.lte("movement_date", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { type, amount, description, movement_date, notes } = body as Record<string, unknown>;

  if (!["entrada", "saida", "transferencia"].includes(String(type ?? "")))
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  if (!amount || Number(amount) <= 0)
    return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
  if (!description)
    return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });

  const { data, error } = await admin
    .from("financial_cash_movements")
    .insert({
      type:          String(type),
      amount:        Number(amount),
      description:   String(description).trim(),
      movement_date: movement_date ? String(movement_date) : new Date().toISOString().split("T")[0],
      created_by:    userId,
      notes:         notes ? String(notes) : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movement: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await admin.from("financial_cash_movements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
