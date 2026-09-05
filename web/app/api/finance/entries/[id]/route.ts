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
  if (body.amount      !== undefined) updates.amount      = Number(body.amount);
  if (body.description !== undefined) updates.description = String(body.description).trim();
  if (body.category    !== undefined) updates.category    = String(body.category);
  if (body.entry_date  !== undefined) updates.entry_date  = String(body.entry_date);
  if (body.notes       !== undefined) updates.notes       = body.notes ? String(body.notes) : null;
  if (body.player_name !== undefined) updates.player_name = body.player_name ? String(body.player_name) : null;

  const { data, error } = await admin
    .from("financial_entries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { id } = await params;

  const { error } = await admin.from("financial_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
