import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Os Meus Pagamentos" };

const STATUS_LABELS: Record<string, string> = { pago: "Pago", pendente: "Pendente", isento: "Isento", atrasado: "Atrasado" };
const STATUS_COLORS: Record<string, string> = {
  pago:     "bg-green-100 text-green-800",
  pendente: "bg-yellow-100 text-yellow-800",
  isento:   "bg-gray-100 text-gray-600",
  atrasado: "bg-red-100 text-red-800",
};
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

export default async function MeusPagamentosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myPlayers } = await supabase
    .from("players").select("id").eq("user_id", user.id);

  const playerIds = (myPlayers ?? []).map((p: { id: string }) => p.id);

  type Payment = { id: string; month: number; reference_year: number; amount: number | null; amount_due: number | null; status: string | null; payment_date: string | null };
  let payments: Payment[] = [];

  if (playerIds.length > 0) {
    const { data } = await supabase
      .from("player_payments")
      .select("id, month, reference_year, amount, amount_due, status, payment_date")
      .in("player_id", playerIds)
      .order("reference_year", { ascending: false })
      .order("month", { ascending: false });
    payments = (data ?? []) as Payment[];
  }

  const totalPaid    = payments.filter((p) => p.status === "pago").reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalPending = payments.filter((p) => p.status === "pendente" || p.status === "atrasado").reduce((s, p) => s + (p.amount_due ?? 0), 0);

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
          <p className={`text-2xl font-bold ${totalPending > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmt(totalPending)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CreditCard className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum registo encontrado.</p>
              {playerIds.length === 0 && (
                <p className="text-xs text-muted-foreground">A tua conta ainda não está ligada ao perfil de jogador. Contacta o administrador.</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{MONTH_NAMES[(p.month ?? 1) - 1]} {p.reference_year}</p>
                    {p.payment_date && <p className="text-xs text-muted-foreground">Pago em {new Date(p.payment_date).toLocaleDateString("pt-PT")}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{p.amount != null ? fmt(p.amount) : fmt(p.amount_due ?? 0)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[p.status ?? "pendente"] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[p.status ?? "pendente"] ?? p.status}
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
