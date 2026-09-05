import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.amount       !== undefined) updates.amount       = Number(body.amount);
  if (body.description  !== undefined) updates.description  = String(body.description).trim();
  if (body.category     !== undefined) updates.category     = String(body.category);
  if (body.expense_date !== undefined) updates.expense_date = String(body.expense_date);
  if (body.supplier     !== undefined) updates.supplier     = body.supplier ? String(body.supplier) : null;
  if (body.notes        !== undefined) updates.notes        = body.notes ? String(body.notes) : null;

  const { data, error } = await admin
    .from("financial_expenses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { id } = await params;

  const { error } = await admin.from("financial_expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
