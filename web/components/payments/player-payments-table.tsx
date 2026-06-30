"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, ClipboardList, History, Loader2, SlidersHorizontal, Search } from "lucide-react";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Badge }   from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  Player, PlayerPaymentWithPlayer, PlayerPaymentSummary, Season,
  PlayerPaymentStatus,
} from "@/types/database";
import { MONTH_NAMES_PT, PLAYER_PAYMENT_STATUS_LABELS } from "@/types/database";
import {
  getSeasonMonths, statusBadgeClass, statusLabel, complianceBadgeClass, formatCurrencyEUR,
} from "@/lib/payment-utils";

interface Props {
  players:      Player[];
  payments:     PlayerPaymentWithPlayer[];
  summary:      PlayerPaymentSummary[];
  loading:      boolean;
  season:       Season | null;
  onRegister:   (player: Player, month?: number, year?: number) => void;
  onHistory:    (player: Player) => void;
  onMarkPaid:   (player: Player, month: number, year: number) => Promise<void>;
}

export function PlayerPaymentsTable({
  players, payments, summary, loading, season, onRegister, onHistory, onMarkPaid,
}: Props) {
  const today         = new Date();
  const seasonMonths  = useMemo(() => (season ? getSeasonMonths(season) : []), [season]);

  // Mês padrão = mês atual se estiver na temporada, senão último mês da temporada
  const defaultMonth = useMemo(() => {
    const inSeason = seasonMonths.find(
      (m) => m.month === today.getMonth() + 1 && m.year === today.getFullYear()
    );
    return inSeason ?? seasonMonths.at(-1) ?? null;
  }, [seasonMonths]);

  const [filterMonthKey, setFilterMonthKey] = useState<string>(() =>
    defaultMonth ? `${defaultMonth.month}-${defaultMonth.year}` : ""
  );
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [filterSearch,  setFilterSearch]  = useState("");
  const [markingPaid,   setMarkingPaid]   = useState<string | null>(null);

  const [selMonth, selYear] = filterMonthKey.split("-").map(Number);

  // Index de pagamentos: player_id → month-year → payment
  const paymentIndex = useMemo(() => {
    const idx = new Map<string, Map<string, PlayerPaymentWithPlayer>>();
    for (const p of payments) {
      if (!idx.has(p.player_id)) idx.set(p.player_id, new Map());
      idx.get(p.player_id)!.set(`${p.month}-${p.reference_year}`, p);
    }
    return idx;
  }, [payments]);

  // Index de summary: player_id → summary
  const summaryIndex = useMemo(() => {
    const idx = new Map<string, PlayerPaymentSummary>();
    for (const s of summary) idx.set(s.player_id, s);
    return idx;
  }, [summary]);

  // Linhas filtradas
  const rows = useMemo(() => {
    let filtered = players;

    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || String(p.number ?? "").includes(q)
      );
    }

    if (filterStatus !== "all" && filterMonthKey) {
      filtered = filtered.filter((p) => {
        const pay = paymentIndex.get(p.id)?.get(filterMonthKey);
        if (filterStatus === "unregistered") return !pay;
        return pay?.status === filterStatus;
      });
    }

    return filtered;
  }, [players, filterSearch, filterStatus, filterMonthKey, paymentIndex]);

  async function handleMarkPaid(player: Player) {
    if (!selMonth || !selYear) return;
    setMarkingPaid(player.id);
    await onMarkPaid(player, selMonth, selYear);
    setMarkingPaid(null);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <ClipboardList className="h-10 w-10 opacity-30" />
        <p className="text-sm">Nenhum jogador inscrito nesta temporada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Mês */}
        <Select value={filterMonthKey} onValueChange={setFilterMonthKey}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {seasonMonths.map((m) => (
              <SelectItem key={`${m.month}-${m.year}`} value={`${m.month}-${m.year}`}>
                {MONTH_NAMES_PT[m.month - 1]} {m.year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Estado */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {(Object.entries(PLAYER_PAYMENT_STATUS_LABELS) as [PlayerPaymentStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
            <SelectItem value="unregistered">Não registado</SelectItem>
          </SelectContent>
        </Select>

        {/* Pesquisa */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Pesquisar jogador..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </div>

        {rows.length !== players.length && (
          <span className="text-xs text-muted-foreground">{rows.length} / {players.length}</span>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="w-10 px-3 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5 text-left">Jogador</th>
              <th className="px-3 py-2.5 text-center">
                {selMonth && selYear
                  ? `${MONTH_NAMES_PT[selMonth - 1]} ${selYear}`
                  : "Mês"}
              </th>
              <th className="px-3 py-2.5 text-center hidden sm:table-cell">Temporada</th>
              <th className="px-3 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((player) => {
              const pay     = filterMonthKey ? paymentIndex.get(player.id)?.get(filterMonthKey) : undefined;
              const sum     = summaryIndex.get(player.id);
              const pct     = sum?.compliance_pct != null ? Number(sum.compliance_pct) : null;
              const isPaid  = pay?.status === "paid";
              const isMarking = markingPaid === player.id;

              return (
                <tr key={player.id} className="hover:bg-muted/30 transition-colors">
                  {/* Número */}
                  <td className="px-3 py-2.5 text-center">
                    {player.number ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cdpovoa-blue/10 text-[11px] font-bold text-cdpovoa-blue">
                        {player.number}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Nome */}
                  <td className="px-3 py-2.5 font-medium">{player.name}</td>

                  {/* Estado mês */}
                  <td className="px-3 py-2.5 text-center">
                    {pay ? (
                      <span
                        title={[
                          pay.status !== "exempt" && `${formatCurrencyEUR(Number(pay.amount))} / ${formatCurrencyEUR(Number(pay.amount_due))}`,
                          pay.payment_date && `Pago em ${new Date(pay.payment_date).toLocaleDateString("pt-PT")}`,
                          pay.method && `Via ${pay.method}`,
                          pay.notes,
                        ].filter(Boolean).join("\n")}
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold cursor-default ${statusBadgeClass(pay.status)}`}
                      >
                        {statusLabel(pay.status)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Temporada */}
                  <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                    {pct != null ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${complianceBadgeClass(pct)}`}>
                        {pct}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Ações */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {/* Marcar Pago rápido */}
                      {filterMonthKey && !isPaid && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          disabled={isMarking}
                          title="Marcar como Pago"
                          onClick={() => handleMarkPaid(player)}
                        >
                          {isMarking
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}

                      {/* Registar / Editar */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        title={pay ? "Editar pagamento" : "Registar pagamento"}
                        onClick={() => onRegister(player, selMonth || undefined, selYear || undefined)}
                      >
                        <ClipboardList className="h-3.5 w-3.5 mr-1" />
                        {pay ? "Editar" : "Registar"}
                      </Button>

                      {/* Histórico */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-cdpovoa-blue hover:text-cdpovoa-blue hover:bg-cdpovoa-blue/10"
                        title="Ver histórico completo"
                        onClick={() => onHistory(player)}
                      >
                        <History className="h-3.5 w-3.5 mr-1" />
                        Histórico
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-10 text-muted-foreground">
            <Search className="h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhum jogador corresponde aos filtros.</p>
          </div>
        )}
      </div>

      {/* Legenda rápida */}
      <div className="flex flex-wrap gap-2">
        {([["paid","Pago"],["partial","Parcial"],["late","Em atraso"],["exempt","Isento"]] as const).map(([s, l]) => (
          <Badge key={s} variant="outline" className={`text-xs ${statusBadgeClass(s)}`}>{l}</Badge>
        ))}
      </div>
    </div>
  );
}
