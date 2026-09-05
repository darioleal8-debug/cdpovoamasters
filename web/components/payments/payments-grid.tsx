"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import { Search, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  RosterEntry, PlayerPaymentWithPlayer, PlayerPaymentSummary, Season,
} from "@/types/database";
import {
  getSeasonMonths, deriveCellState, CELL_COLORS, CELL_STATUS_LABELS,
  MONTH_NAMES_SHORT, GridCellStatus, GridCell,
  formatCurrencyEUR, complianceBadgeClass, monthLabel,
} from "@/lib/payment-utils";
import type { ActiveCellInfo } from "./cell-popover";

// ── Consts ────────────────────────────────────────────────────────────────────

const FILTER_STATUSES: { status: GridCellStatus; label: string }[] = [
  { status: "paid",    label: "Pago"      },
  { status: "partial", label: "Parcial"   },
  { status: "late",    label: "Em atraso" },
  { status: "exempt",  label: "Isento"    },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  players:     RosterEntry[];
  payments:    PlayerPaymentWithPlayer[];
  summary:     PlayerPaymentSummary[];
  loading:     boolean;
  season:      Season | null;
  onCellClick: (info: ActiveCellInfo) => void;
  onHistory:   (player: RosterEntry) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentsGrid({
  players, payments, summary, loading, season, onCellClick, onHistory,
}: Props) {
  const today   = useMemo(() => new Date(), []);
  const months  = useMemo(() => (season ? getSeasonMonths(season) : []), [season]);
  const [activeFilters, setActiveFilters] = useState<Set<GridCellStatus>>(new Set());
  const [search, setSearch]               = useState("");

  // ── Payment index: player_id → month-year → payment ───────────────────────
  const payIndex = useMemo(() => {
    const idx = new Map<string, Map<string, PlayerPaymentWithPlayer>>();
    for (const p of payments) {
      if (!idx.has(p.player_id)) idx.set(p.player_id, new Map());
      idx.get(p.player_id)!.set(`${p.month}-${p.reference_year}`, p);
    }
    return idx;
  }, [payments]);

  // ── Summary index ─────────────────────────────────────────────────────────
  const sumIndex = useMemo(() => {
    const idx = new Map<string, PlayerPaymentSummary>();
    for (const s of summary) idx.set(s.player_id, s);
    return idx;
  }, [summary]);

  // ── Toggle filter chip ───────────────────────────────────────────────────
  function toggleFilter(status: GridCellStatus) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    let rows = players;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        p => p.name.toLowerCase().includes(q) || String(p.number ?? "").includes(q)
      );
    }
    if (activeFilters.size > 0) {
      rows = rows.filter(p =>
        months.some(m => {
          const pay = payIndex.get(p.player_id ?? "")?.get(`${m.month}-${m.year}`) ?? null;
          const cell = deriveCellState(m.month, m.year, pay, today);
          return activeFilters.has(cell.status);
        })
      );
    }
    return rows;
  }, [players, search, activeFilters, months, payIndex, today]);

  // ── Month totals (bottom row) ─────────────────────────────────────────────
  const monthTotals = useMemo(() =>
    months.map(m =>
      payments
        .filter(p => p.month === m.month && p.reference_year === m.year)
        .reduce((s, p) => s + Number(p.amount), 0)
    ),
  [months, payments]);

  const grandTotal = monthTotals.reduce((s, v) => s + v, 0);

  // ── Current month ─────────────────────────────────────────────────────────
  const isCurrentMonth = useCallback((m: { month: number; year: number }) =>
    m.month === today.getMonth() + 1 && m.year === today.getFullYear(),
  [today]);

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = [
      "Jogador", "#",
      ...months.map(m => monthLabel(m.month, m.year)),
      "Total Temporada",
    ];
    const rows = filteredPlayers.map(p => {
      const cells = months.map(m => {
        const pay  = payIndex.get(p.player_id ?? "")?.get(`${m.month}-${m.year}`) ?? null;
        const cell = deriveCellState(m.month, m.year, pay, today);
        return CELL_STATUS_LABELS[cell.status] + (cell.amountPaid > 0 ? ` ${cell.amountPaid}€` : "");
      });
      const s = sumIndex.get(p.player_id ?? "");
      return [p.name, String(p.number ?? ""), ...cells, s ? `${Number(s.total_paid)}€` : "0€"];
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `pagamentos-${season?.name ?? "temporada"}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
        </div>
        <div className="rounded-lg border overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 border-b">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-28 rounded" />
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-7 flex-1 rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!season) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <p className="text-sm">Seleciona uma temporada para ver a grelha de pagamentos.</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <p className="text-sm font-medium">Ainda sem quotas definidas nesta temporada.</p>
        <p className="text-xs">Inscreve jogadores no plantel para começar a registar pagamentos.</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Realçar:</span>

          {FILTER_STATUSES.map(({ status, label }) => {
            const active = activeFilters.has(status);
            const color  = CELL_COLORS[status];
            return (
              <button
                key={status}
                role="button"
                aria-pressed={active}
                onClick={() => toggleFilter(status)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all
                  ${active
                    ? "border-transparent text-white shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30"}`}
                style={active ? { background: color.bg } : {}}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                  style={{ background: color.bg }}
                />
                {label}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8 text-xs w-44"
              placeholder="Pesquisar jogador…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Pesquisar jogador"
            />
          </div>

          {/* Export */}
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>

          {filteredPlayers.length !== players.length && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {filteredPlayers.length}/{players.length}
            </span>
          )}
        </div>

        {/* ── Grid table ─────────────────────────────────────────────────── */}
        <div className="rounded-lg border overflow-auto">
          <table
            role="grid"
            className="w-full text-sm border-collapse"
            style={{ minWidth: Math.max(640, 200 + months.length * 56 + 80) }}
          >
            <thead>
              <tr className="border-b bg-muted/40">
                {/* Jogador (sticky) */}
                <th
                  scope="col"
                  className="sticky left-0 z-20 bg-muted/40 border-r px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                  style={{ minWidth: 180 }}
                >
                  Jogador
                </th>

                {/* Month columns */}
                {months.map(m => {
                  const isCurrent = isCurrentMonth(m);
                  return (
                    <th
                      key={m.label}
                      scope="col"
                      className={`px-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wide whitespace-nowrap
                        ${isCurrent ? "bg-background text-foreground" : "text-muted-foreground"}`}
                      style={{ width: 52, minWidth: 52 }}
                    >
                      {MONTH_NAMES_SHORT[m.month - 1]}
                      {isCurrent && (
                        <span className="ml-0.5 inline-block h-1 w-1 rounded-full bg-cdpovoa-primary align-middle" />
                      )}
                    </th>
                  );
                })}

                {/* Temporada total */}
                <th
                  scope="col"
                  className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                  style={{ minWidth: 96 }}
                >
                  Temporada
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/40">
              {filteredPlayers.length === 0 && (
                <tr>
                  <td colSpan={months.length + 2} className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum jogador corresponde à pesquisa.
                  </td>
                </tr>
              )}

              {filteredPlayers.map(player => {
                const playerSum = sumIndex.get(player.player_id ?? "");
                const pct       = playerSum?.compliance_pct != null ? Number(playerSum.compliance_pct) : null;

                return (
                  <tr key={player.user_id} className="hover:bg-muted/20 transition-colors group">
                    {/* Jogador (sticky) */}
                    <td
                      className="sticky left-0 z-10 bg-background group-hover:bg-muted/20 border-r px-3 py-2"
                      style={{ minWidth: 180 }}
                    >
                      <button
                        className="flex items-center gap-2 w-full text-left"
                        onClick={() => onHistory(player)}
                        title={`Ver histórico de ${player.name}`}
                      >
                        {player.number ? (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cdpovoa-primary/10 text-[11px] font-bold text-cdpovoa-primary">
                            {player.number}
                          </span>
                        ) : (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] text-muted-foreground">
                            —
                          </span>
                        )}
                        <span className="text-sm font-medium truncate">{player.name}</span>
                      </button>
                    </td>

                    {/* Month cells */}
                    {months.map(m => {
                      const pay  = payIndex.get(player.player_id ?? "")?.get(`${m.month}-${m.year}`) ?? null;
                      const cell = deriveCellState(m.month, m.year, pay, today);
                      const colors = CELL_COLORS[cell.status];
                      const dimmed = activeFilters.size > 0 && !activeFilters.has(cell.status);

                      const tooltipLines = [
                        `${player.name} · ${monthLabel(m.month, m.year, true)}`,
                        CELL_STATUS_LABELS[cell.status],
                        cell.amountPaid > 0 || cell.amountDue > 0
                          ? `${formatCurrencyEUR(cell.amountPaid)} pago / ${formatCurrencyEUR(cell.amountDue)} devido`
                          : null,
                        pay?.payment_date
                          ? `Pago em ${new Date(pay.payment_date).toLocaleDateString("pt-PT")}`
                          : null,
                        pay?.notes ?? null,
                      ].filter(Boolean).join("\n");

                      return (
                        <td key={m.label} className="px-1 py-1.5 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                aria-label={tooltipLines}
                                onClick={e => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  onCellClick({ player, cell, anchor: rect });
                                }}
                                className="w-[42px] h-7 rounded-[5px] transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                style={{
                                  background:  colors.bg,
                                  color:       colors.text,
                                  border:      `1px solid ${colors.border}`,
                                  opacity:     dimmed ? 0.18 : 1,
                                  cursor:      "pointer",
                                }}
                                tabIndex={0}
                              >
                                {/* Pattern overlay for unregistered (accessibility) */}
                                {cell.status === "unregistered" && (
                                  <svg
                                    width="42" height="28" className="absolute inset-0 rounded-[5px] pointer-events-none"
                                    style={{ position: "absolute", left: 0, top: 0 }}
                                  >
                                    <defs>
                                      <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                        <line x1="0" y1="0" x2="0" y2="4" stroke="#FDA29B" strokeWidth="1" />
                                      </pattern>
                                    </defs>
                                    <rect width="42" height="28" fill="url(#hatch)" rx="5" />
                                  </svg>
                                )}
                                <span className="sr-only">{CELL_STATUS_LABELS[cell.status]}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="whitespace-pre-line text-xs">
                              {tooltipLines}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}

                    {/* Temporada total */}
                    <td className="px-3 py-2 text-right">
                      {pct != null ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${complianceBadgeClass(pct)}`}
                          title={playerSum ? `${formatCurrencyEUR(Number(playerSum.total_paid))} / ${formatCurrencyEUR(Number(playerSum.total_due))}` : ""}
                        >
                          {pct}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* ── Total por mês (tfoot) ─────────────────────────────────── */}
            <tfoot>
              <tr className="border-t-2 bg-muted/30 font-medium">
                <td className="sticky left-0 z-10 bg-muted/30 border-r px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Total por mês
                </td>
                {monthTotals.map((total, i) => (
                  <td key={i} className="px-1 py-2.5 text-center text-xs tabular-nums font-semibold">
                    {total > 0 ? formatCurrencyEUR(total) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right text-xs tabular-nums font-bold">
                  {grandTotal > 0 ? formatCurrencyEUR(grandTotal) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Legend ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {(Object.entries(CELL_STATUS_LABELS) as [GridCellStatus, string][])
            .filter(([s]) => s !== "future")
            .map(([status, label]) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                  style={{ background: CELL_COLORS[status].bg }}
                />
                {label}
              </span>
            ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
