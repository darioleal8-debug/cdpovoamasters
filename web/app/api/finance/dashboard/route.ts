import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const now       = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const monthStart = `${thisYear}-${String(thisMonth).padStart(2, "0")}-01`;
  const monthEnd   = new Date(thisYear, thisMonth, 0).toISOString().split("T")[0];

  // Active season — filter cota stats to avoid cross-season contamination
  const { data: activeSeason } = await admin
    .from("seasons").select("id").eq("status", "ativa").maybeSingle();
  const activeSeasonId = activeSeason?.id ?? null;

  const cotasPaidQ = activeSeasonId
    ? admin.from("player_payments").select("amount").eq("status", "paid").eq("season_id", activeSeasonId)
    : admin.from("player_payments").select("amount").eq("status", "paid");
  const cotasLateQ = activeSeasonId
    ? admin.from("player_payments").select("id").in("status", ["late", "partial"]).eq("season_id", activeSeasonId)
    : admin.from("player_payments").select("id").in("status", ["late", "partial"]);

  const [entriesAll, expensesAll, monthEntries, monthExpenses, cotasPaid, cotasLate] =
    await Promise.all([
      admin.from("financial_entries").select("amount, entry_date, description, category, source_type, id, player_name, created_at").order("entry_date", { ascending: false }),
      admin.from("financial_expenses").select("amount, expense_date, description, category, id, created_at").order("expense_date", { ascending: false }),
      admin.from("financial_entries").select("amount").gte("entry_date", monthStart).lte("entry_date", monthEnd),
      admin.from("financial_expenses").select("amount").gte("expense_date", monthStart).lte("expense_date", monthEnd),
      cotasPaidQ,
      cotasLateQ,
    ]);

  const totalEntries  = (entriesAll.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const totalExpenses = (expensesAll.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const totalBalance  = totalEntries - totalExpenses;

  // Caixa Atual = saldo financeiro acumulado (entradas − saídas globais)
  const cashBalance = totalBalance;

  const mE = (monthEntries.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const mX = (monthExpenses.data ?? []).reduce((s, e) => s + Number(e.amount), 0);

  // Monthly chart — last 12 months
  const monthlyChart: { month: string; entradas: number; saidas: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisYear, now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const label = `${String(m).padStart(2, "0")}/${y}`;
    const mStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const mEnd   = new Date(y, m, 0).toISOString().split("T")[0];

    const eSum = (entriesAll.data ?? [])
      .filter((e) => e.entry_date >= mStart && e.entry_date <= mEnd)
      .reduce((s, e) => s + Number(e.amount), 0);
    const xSum = (expensesAll.data ?? [])
      .filter((e) => e.expense_date >= mStart && e.expense_date <= mEnd)
      .reduce((s, e) => s + Number(e.amount), 0);

    monthlyChart.push({ month: label, entradas: eSum, saidas: xSum });
  }

  const cotasTotal  = (cotasPaid.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const playersLate = (cotasLate.data ?? []).length;

  return NextResponse.json({
    totalBalance,
    cashBalance,
    monthEntries: mE,
    monthExpenses: mX,
    monthlyChart,
    recentEntries:  (entriesAll.data  ?? []).slice(0, 5),
    recentExpenses: (expensesAll.data ?? []).slice(0, 5),
    cotasStats: { totalPaid: cotasTotal, totalPending: 0, playersLate },
  });
}
