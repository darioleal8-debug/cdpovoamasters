import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreditCard, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Season } from "@/types/database";

export const metadata = { title: "Os Meus Pagamentos" };

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

// Default monthly quota when no record exists
const DEFAULT_AMOUNT_DUE = 20;

type DbPayment = {
  id: string;
  player_id: string;
  season_id: string | null;
  month: number;
  reference_year: number;
  amount: number | null;
  amount_due: number | null;
  status: string | null;
  payment_date: string | null;
};

type DisplayRow = {
  key: string;
  month: number;
  year: number;
  label: string;
  status: "paid" | "partial" | "late" | "exempt" | "unregistered" | "future";
  amountPaid: number;
  amountDue: number;
  paymentDate: string | null;
  seasonName: string;
};

const STATUS_LABEL: Record<string, string> = {
  paid:         "Pago",
  partial:      "Parcial",
  late:         "Em atraso",
  exempt:       "Isento",
  unregistered: "Em falta",
  future:       "Previsto",
};
const STATUS_CLASS: Record<string, string> = {
  paid:         "bg-green-100 text-green-800",
  partial:      "bg-amber-100 text-amber-800",
  late:         "bg-red-100 text-red-800",
  exempt:       "bg-gray-100 text-gray-600",
  unregistered: "bg-red-50 text-red-700 border border-red-200",
  future:       "bg-gray-50 text-gray-400",
};

export default async function MeusPagamentosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Players linked to this user
  const { data: myPlayers } = await supabase
    .from("players")
    .select("id, season_id")
    .eq("user_id", user.id);

  const playerIds  = (myPlayers ?? []).map((p: { id: string }) => p.id);
  const seasonIds  = [...new Set((myPlayers ?? []).map((p: { season_id: string }) => p.season_id).filter(Boolean))] as string[];

  // Seasons the player belongs to
  type SeasonRow = { id: string; name: string; start_date: string; end_date: string; status: string };
  let seasons: SeasonRow[] = [];
  if (seasonIds.length > 0) {
    const { data } = await supabase
      .from("seasons")
      .select("id, name, start_date, end_date, status")
      .in("id", seasonIds)
      .order("start_date", { ascending: false });
    seasons = (data ?? []) as SeasonRow[];
  }

  // All payments for this player
  let dbPayments: DbPayment[] = [];
  if (playerIds.length > 0) {
    const { data } = await supabase
      .from("player_payments")
      .select("id, player_id, season_id, month, reference_year, amount, amount_due, status, payment_date")
      .in("player_id", playerIds);
    dbPayments = (data ?? []) as DbPayment[];
  }

  // Build season name map
  const seasonNames = new Map(seasons.map((s) => [s.id, s.name]));

  const today          = new Date();
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Build a lookup of payments by month+year
  const paymentByKey = new Map<string, DbPayment>();
  for (const p of dbPayments) {
    paymentByKey.set(`${p.month}-${p.reference_year}`, p);
  }

  // Generate display rows: all months from each season + any orphan DB payments
  const displayRows: DisplayRow[] = [];
  const coveredKeys = new Set<string>();

  for (const season of seasons) {
    const start = new Date(season.start_date);
    const end   = new Date(season.end_date);
    const cur   = new Date(start.getFullYear(), start.getMonth(), 1);

    while (cur <= end) {
      const month = cur.getMonth() + 1;
      const year  = cur.getFullYear();
      const key   = `${month}-${year}`;
      coveredKeys.add(key);

      const cellStart = new Date(year, month - 1, 1);
      const isFuture  = cellStart > thisMonthStart;
      const payment   = paymentByKey.get(key);

      let status: DisplayRow["status"];
      let amountPaid = 0;
      let amountDue  = 0;

      if (payment) {
        status     = (payment.status as DisplayRow["status"]) ?? "unregistered";
        amountPaid = payment.amount ?? 0;
        amountDue  = payment.amount_due ?? DEFAULT_AMOUNT_DUE;
      } else if (isFuture) {
        status    = "future";
        amountDue = DEFAULT_AMOUNT_DUE;
      } else {
        status    = "unregistered";
        amountDue = DEFAULT_AMOUNT_DUE;
      }

      displayRows.push({
        key,
        month,
        year,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        status,
        amountPaid,
        amountDue,
        paymentDate: payment?.payment_date ?? null,
        seasonName:  season.name,
      });

      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // Add DB payments not covered by any season month (edge-case: orphan records)
  for (const p of dbPayments) {
    const key = `${p.month}-${p.reference_year}`;
    if (!coveredKeys.has(key)) {
      const seasonId = p.season_id ?? "";
      displayRows.push({
        key,
        month:       p.month,
        year:        p.reference_year,
        label:       `${MONTH_NAMES[p.month - 1]} ${p.reference_year}`,
        status:      (p.status as DisplayRow["status"]) ?? "unregistered",
        amountPaid:  p.amount ?? 0,
        amountDue:   p.amount_due ?? DEFAULT_AMOUNT_DUE,
        paymentDate: p.payment_date ?? null,
        seasonName:  seasonNames.get(seasonId) ?? "",
      });
    }
  }

  // Sort newest first
  displayRows.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);

  // Totals — only past/current months, not future, not exempt
  const totalPaid = displayRows
    .filter((r) => r.status === "paid" || r.status === "partial")
    .reduce((s, r) => s + r.amountPaid, 0);

  const totalPending = displayRows
    .filter((r) => r.status === "unregistered" || r.status === "late" || r.status === "partial")
    .reduce((s, r) => {
      if (r.status === "partial") return s + Math.max(0, r.amountDue - r.amountPaid);
      return s + r.amountDue;
    }, 0);

  const noData = playerIds.length === 0 || (seasons.length === 0 && dbPayments.length === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Os Meus Pagamentos</h1>
        <p className="text-muted-foreground">Histórico das tuas quotas e mensalidades.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Pago</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Em Dívida</p>
          <p className={`text-2xl font-bold ${totalPending > 0 ? "text-red-600" : "text-muted-foreground"}`}>
            {fmt(totalPending)}
          </p>
        </CardContent></Card>
      </div>

      {totalPending > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Tens pagamentos em atraso. Contacta o clube para regularizar a situação.</p>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent className="p-0">
          {noData ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
              <CreditCard className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum registo encontrado.</p>
              {playerIds.length === 0 && (
                <p className="text-xs text-muted-foreground">A tua conta ainda não está ligada ao perfil de jogador. Contacta o administrador.</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {displayRows.map((r) => (
                <div key={`${r.key}-${r.seasonName}`} className={`flex items-center justify-between px-4 py-3 ${r.status === "future" ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">{r.label}</p>
                    {r.seasonName && (
                      <p className="text-xs text-muted-foreground">{r.seasonName}</p>
                    )}
                    {r.paymentDate && (
                      <p className="text-xs text-muted-foreground">
                        Pago em {new Date(r.paymentDate).toLocaleDateString("pt-PT")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status !== "future" && r.status !== "exempt" && (
                      <span className="text-sm font-semibold tabular-nums">
                        {r.status === "unregistered" || r.status === "late"
                          ? fmt(r.amountDue)
                          : fmt(r.amountPaid)}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[r.status] ?? STATUS_CLASS.future}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
