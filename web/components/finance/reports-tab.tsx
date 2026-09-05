"use client";

import { useState, useMemo } from "react";
import { useFinanceEntries  } from "@/hooks/use-finance-entries";
import { useFinanceExpenses } from "@/hooks/use-finance-expenses";
import { useSeasons }         from "@/hooks/use-seasons";
import {
  INCOME_CATEGORIES, EXPENSE_CATEGORIES,
  getIncomeCategoryLabel, getExpenseCategoryLabel,
  formatEUR,
} from "@/lib/finance-constants";
import { Button }   from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileDown, PrinterIcon, BarChart3 } from "lucide-react";

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

interface MonthRow {
  month:    number;
  year:     number;
  label:    string;
  entradas: number;
  saidas:   number;
  saldo:    number;
}

export function ReportsTab() {
  const { seasons, activeSeason } = useSeasons();
  const [seasonId, setSeasonId]   = useState<string | null>(null);
  const sid = seasonId ?? activeSeason?.id ?? null;

  const { entries,  loading: lE } = useFinanceEntries({ season_id: sid });
  const { expenses, loading: lX } = useFinanceExpenses({ season_id: sid });
  const loading = lE || lX;

  // Totais por categoria
  const entryByCat  = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach((e) => { m[e.category] = (m[e.category] ?? 0) + Number(e.amount); });
    return m;
  }, [entries]);

  const expByCat = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.forEach((e) => { m[e.category] = (m[e.category] ?? 0) + Number(e.amount); });
    return m;
  }, [expenses]);

  // Resumo mensal
  const monthlyRows = useMemo<MonthRow[]>(() => {
    const map: Record<string, MonthRow> = {};

    entries.forEach((e) => {
      const [y, m] = e.entry_date.split("-").map(Number);
      const key = `${y}-${m}`;
      if (!map[key]) map[key] = { month: m, year: y, label: `${MONTH_NAMES[m-1]} ${y}`, entradas: 0, saidas: 0, saldo: 0 };
      map[key].entradas += Number(e.amount);
    });

    expenses.forEach((e) => {
      const [y, m] = e.expense_date.split("-").map(Number);
      const key = `${y}-${m}`;
      if (!map[key]) map[key] = { month: m, year: y, label: `${MONTH_NAMES[m-1]} ${y}`, entradas: 0, saidas: 0, saldo: 0 };
      map[key].saidas += Number(e.amount);
    });

    return Object.values(map)
      .map((r) => ({ ...r, saldo: r.entradas - r.saidas }))
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [entries, expenses]);

  const totalEntradas = entries.reduce((s, e)  => s + Number(e.amount),  0);
  const totalSaidas   = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const saldoFinal    = totalEntradas - totalSaidas;

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={sid ?? ""} onValueChange={setSeasonId}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Selecionar temporada" /></SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <PrinterIcon className="h-4 w-4" />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Resumo geral */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Resumo Geral da Temporada
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4">
                <p className="text-2xl font-bold text-green-700 tabular-nums">{formatEUR(totalEntradas)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Entradas</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-4">
                <p className="text-2xl font-bold text-red-600 tabular-nums">{formatEUR(totalSaidas)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Saídas</p>
              </div>
              <div className={`rounded-lg p-4 ${saldoFinal >= 0 ? "bg-blue-50 dark:bg-blue-950/20" : "bg-orange-50 dark:bg-orange-950/20"}`}>
                <p className={`text-2xl font-bold tabular-nums ${saldoFinal >= 0 ? "text-blue-700" : "text-orange-600"}`}>
                  {formatEUR(saldoFinal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Saldo Final</p>
              </div>
            </div>
          </div>

          {/* Entradas por categoria */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm font-semibold mb-3">Entradas por Categoria</p>
            <div className="space-y-2">
              {INCOME_CATEGORIES.filter((c) => entryByCat[c.value]).map((c) => {
                const val = entryByCat[c.value] ?? 0;
                const pct = totalEntradas > 0 ? (val / totalEntradas) * 100 : 0;
                return (
                  <div key={c.value} className="flex items-center gap-3">
                    <span className="w-28 text-xs text-muted-foreground shrink-0">{getIncomeCategoryLabel(c.value)}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                    <span className="w-24 text-right text-xs font-semibold tabular-nums shrink-0 text-green-600">
                      {formatEUR(val)}
                    </span>
                  </div>
                );
              })}
              {Object.keys(entryByCat).length === 0 && (
                <p className="text-sm text-muted-foreground">Sem entradas nesta temporada.</p>
              )}
            </div>
          </div>

          {/* Saídas por categoria */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm font-semibold mb-3">Saídas por Categoria</p>
            <div className="space-y-2">
              {EXPENSE_CATEGORIES.filter((c) => expByCat[c.value]).map((c) => {
                const val = expByCat[c.value] ?? 0;
                const pct = totalSaidas > 0 ? (val / totalSaidas) * 100 : 0;
                return (
                  <div key={c.value} className="flex items-center gap-3">
                    <span className="w-28 text-xs text-muted-foreground shrink-0">{getExpenseCategoryLabel(c.value)}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                    <span className="w-24 text-right text-xs font-semibold tabular-nums shrink-0 text-red-500">
                      {formatEUR(val)}
                    </span>
                  </div>
                );
              })}
              {Object.keys(expByCat).length === 0 && (
                <p className="text-sm text-muted-foreground">Sem saídas nesta temporada.</p>
              )}
            </div>
          </div>

          {/* Resumo mensal */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <p className="text-sm font-semibold">Resumo Mensal</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Mês</th>
                    <th className="px-4 py-2 text-right font-medium">Entradas</th>
                    <th className="px-4 py-2 text-right font-medium">Saídas</th>
                    <th className="px-4 py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthlyRows.length === 0
                    ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sem dados.</td></tr>
                    : monthlyRows.map((row) => (
                        <tr key={`${row.year}-${row.month}`} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium">{row.label}</td>
                          <td className="px-4 py-2.5 text-right text-green-600 tabular-nums">{formatEUR(row.entradas)}</td>
                          <td className="px-4 py-2.5 text-right text-red-500  tabular-nums">{formatEUR(row.saidas)}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${row.saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                            {formatEUR(row.saldo)}
                          </td>
                        </tr>
                      ))}
                </tbody>
                {monthlyRows.length > 0 && (
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr>
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right text-green-600 tabular-nums">{formatEUR(totalEntradas)}</td>
                      <td className="px-4 py-2.5 text-right text-red-500  tabular-nums">{formatEUR(totalSaidas)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${saldoFinal >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                        {formatEUR(saldoFinal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
