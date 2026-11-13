"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";

interface ClubUsage {
  id: string; name: string; active: boolean; limit_eur: number | null;
  monthly: Record<string, { cost: number; calls: number }>;
  features: Record<string, number>;
}
interface Data {
  months: string[]; current_month: string; clubs: ClubUsage[];
  rates: { input_usd: number; cached_usd: number; output_usd: number; usd_to_eur: number };
}

const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("pt-PT", { month: "short", year: "2-digit", timeZone: "UTC" });
};

export function MasterAiClient() {
  const [data, setData] = useState<Data | null>(null);
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/master/ai-usage?months=${months}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) toast({ title: j.error ?? "Erro ao carregar", variant: "destructive" });
    else setData(j as Data);
    setLoading(false);
  }, [months]);
  useEffect(() => { load(); }, [load]);

  async function saveLimit(c: ClubUsage, value: string) {
    const v = Number(value.replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v === c.limit_eur) return;
    const res = await fetch(`/api/master/clubs/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai_monthly_budget_eur: v }),
    });
    if (!res.ok) { toast({ title: "Erro ao guardar o limite", variant: "destructive" }); return; }
    toast({ title: "Limite atualizado" });
    load();
  }

  const total = (c: ClubUsage) => Object.values(c.monthly).reduce((s, x) => s + x.cost, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5" /> Consumo de IA por equipa</h1>
          <p className="text-sm text-muted-foreground">
            Gasto estimado da API DeepSeek por clube e por mês. Cada equipa tem um limite mensal; ao atingi-lo, a IA fica bloqueada até ao mês seguinte.
          </p>
        </div>
        <select
          value={months} onChange={(e) => setMonths(Number(e.target.value))}
          className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Meses a mostrar"
        >
          {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Últimos {n} meses</option>)}
        </select>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Equipa</th>
                  <th className="px-3 py-2">Limite/mês (€)</th>
                  <th className="px-3 py-2">Este mês</th>
                  {data.months.slice(1).map((m) => <th key={m} className="px-3 py-2 text-right">{monthLabel(m)}</th>)}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.clubs.map((c) => {
                  const cur = c.monthly[data.current_month]?.cost ?? 0;
                  const pct = c.limit_eur ? Math.min(100, (cur / c.limit_eur) * 100) : 0;
                  const blocked = c.limit_eur !== null && cur >= c.limit_eur;
                  return (
                    <Fragment key={c.id}>
                      <tr className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpen(open === c.id ? null : c.id)}>
                        <td className="px-3 py-2 font-medium">
                          {c.name}{!c.active && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {c.limit_eur === null ? "—" : (
                            <Input
                              key={`${c.id}-${c.limit_eur}`} defaultValue={c.limit_eur.toFixed(2)} inputMode="decimal"
                              className="h-8 w-20" aria-label={`Limite mensal de ${c.name}`}
                              onBlur={(e) => saveLimit(c, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={blocked ? "font-semibold text-red-600" : ""}>{eur(cur)}</span>
                            {c.limit_eur !== null && (
                              <div className="h-1.5 w-20 overflow-hidden rounded bg-muted" aria-hidden>
                                <div className={blocked ? "h-full bg-red-500" : pct > 75 ? "h-full bg-amber-500" : "h-full bg-emerald-500"} style={{ width: `${pct}%` }} />
                              </div>
                            )}
                            {blocked && <span className="text-xs text-red-600">bloqueado</span>}
                          </div>
                        </td>
                        {data.months.slice(1).map((m) => (
                          <td key={m} className="px-3 py-2 text-right tabular-nums">{c.monthly[m] ? eur(c.monthly[m].cost) : "—"}</td>
                        ))}
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{eur(total(c))}</td>
                      </tr>
                      {open === c.id && (
                        <tr className="border-t bg-muted/20">
                          <td colSpan={4 + data.months.length - 1} className="px-3 py-2 text-xs">
                            <p className="mb-1 font-medium">Este mês por funcionalidade ({c.monthly[data.current_month]?.calls ?? 0} chamadas)</p>
                            {Object.keys(c.features).length === 0 ? "Sem consumo este mês." : (
                              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                                {Object.entries(c.features).sort((a, b) => b[1] - a[1]).map(([f, v]) => <li key={f}>{f}: {eur(v)}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Valores estimados a partir dos tokens devolvidos pela DeepSeek (tarifa usada: {data.rates.input_usd} / {data.rates.cached_usd} (cache) / {data.rates.output_usd} USD por 1M tokens de entrada/saída; 1 USD = {data.rates.usd_to_eur} €).
            O Master Admin não é bloqueado, mas o seu consumo é contabilizado no clube.
          </p>
        </>
      )}
    </div>
  );
}
