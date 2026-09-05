import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const sp        = req.nextUrl.searchParams;
  const season_id = sp.get("season_id");
  const category  = sp.get("category");
  const from      = sp.get("from");
  const to        = sp.get("to");

  let q = admin
    .from("financial_expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .order("created_at",   { ascending: false });

  if (season_id) q = q.eq("season_id", season_id);
  if (category && category !== "all") q = q.eq("category", category);
  if (from) q = q.gte("expense_date", from);
  if (to)   q = q.lte("expense_date", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { amount, description, category, expense_date, season_id, supplier, notes } = body as Record<string, unknown>;

  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: "Valor inválido" },              { status: 400 });
  if (!description)                   return NextResponse.json({ error: "Descrição é obrigatória" },    { status: 400 });
  if (!expense_date)                  return NextResponse.json({ error: "Data é obrigatória" },          { status: 400 });

  const { data, error } = await admin
    .from("financial_expenses")
    .insert({
      amount:       Number(amount),
      description:  String(description).trim(),
      category:     String(category ?? "outro"),
      expense_date: String(expense_date),
      season_id:    season_id ?? null,
      supplier:     supplier ? String(supplier) : null,
      created_by:   userId,
      notes:        notes ? String(notes) : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data }, { status: 201 });
}
