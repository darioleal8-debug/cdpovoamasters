"use client";

import { useFinanceDashboard } from "@/hooks/use-finance-dashboard";
import { formatEUR, isoToDate } from "@/lib/finance-constants";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, TrendingDown, TrendingUp, Wallet, PiggyBank } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function FinanceDashboardTab({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, loading, error } = useFinanceDashboard(refreshKey);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p>{error ?? "Sem dados disponíveis"}</p>
      </div>
    );
  }

  const balancePositive = data.totalBalance >= 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Saldo Total"
          value={formatEUR(data.totalBalance)}
          icon={balancePositive ? TrendingUp : TrendingDown}
          color={balancePositive ? "bg-green-600" : "bg-red-500"}
          sub="Entradas − Saídas"
        />
        <KpiCard
          label="Caixa Atual"
          value={formatEUR(data.cashBalance)}
          icon={PiggyBank}
          color="bg-blue-600"
          sub="Saldo em caixa"
        />
        <KpiCard
          label="Entradas do Mês"
          value={formatEUR(data.monthEntries)}
          icon={TrendingUp}
          color="bg-emerald-600"
        />
        <KpiCard
          label="Saídas do Mês"
          value={formatEUR(data.monthExpenses)}
          icon={Wallet}
          color="bg-orange-500"
        />
      </div>

      {/* Cotas stats */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-3">Cotas de Jogadores</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold tabular-nums text-green-600">{formatEUR(data.cotasStats.totalPaid)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total cobrado</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-amber-600">{data.cotasStats.playersLate}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Jogadores em atraso</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{formatEUR(data.monthEntries)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Entradas este mês</p>
          </div>
        </div>
      </div>

      {/* Gráfico evolução */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-4">Evolução Financeira (12 meses)</p>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.monthlyChart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradE" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="gradX" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} width={56} />
            <Tooltip formatter={(v: number) => formatEUR(v)} />
            <Legend />
            <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#22c55e" fill="url(#gradE)" strokeWidth={2} />
            <Area type="monotone" dataKey="saidas"   name="Saídas"   stroke="#ef4444" fill="url(#gradX)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recentes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-3">Últimas Entradas</p>
          {data.recentEntries.length === 0
            ? <p className="text-sm text-muted-foreground">Sem entradas registadas.</p>
            : <ul className="space-y-2">
                {data.recentEntries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{isoToDate(e.entry_date)}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-green-600">+{formatEUR(Number(e.amount))}</span>
                  </li>
                ))}
              </ul>}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-3">Últimas Saídas</p>
          {data.recentExpenses.length === 0
            ? <p className="text-sm text-muted-foreground">Sem saídas registadas.</p>
            : <ul className="space-y-2">
                {data.recentExpenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{isoToDate(e.expense_date)}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-red-500">−{formatEUR(Number(e.amount))}</span>
                  </li>
                ))}
              </ul>}
        </div>
      </div>
    </div>
  );
}
