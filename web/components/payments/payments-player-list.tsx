"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { RosterEntry, PlayerPaymentWithPlayer, PlayerPaymentSummary, Season } from "@/types/database";
import {
  getSeasonMonths, deriveCellState, CELL_COLORS, MONTH_NAMES_SHORT,
  formatCurrencyEUR, GridCell,
} from "@/lib/payment-utils";

interface Props {
  players:   RosterEntry[];
  payments:  PlayerPaymentWithPlayer[];
  summary:   PlayerPaymentSummary[];
  loading:   boolean;
  season:    Season | null;
  onPlayer:  (player: RosterEntry) => void;
  onDot:     (player: RosterEntry, month: number, year: number) => void;
}

function initials(name: string): string {
  return name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function PaymentsPlayerList({ players, payments, summary, loading, season, onPlayer, onDot }: Props) {
  const today  = useMemo(() => new Date(), []);
  const months = useMemo(() => (season ? getSeasonMonths(season) : []), [season]);
  const [search, setSearch] = useState("");

  // índice payment por player_id + "month-year"
  const payIndex = useMemo(() => {
    const idx = new Map<string, Map<string, PlayerPaymentWithPlayer>>();
    for (const p of payments) {
      if (!idx.has(p.player_id)) idx.set(p.player_id, new Map());
      idx.get(p.player_id)!.set(`${p.month}-${p.reference_year}`, p);
    }
    return idx;
  }, [payments]);

  const sumIndex = useMemo(() => {
    const idx = new Map<string, PlayerPaymentSummary>();
    for (const s of summary) idx.set(s.player_id, s);
    return idx;
  }, [summary]);

  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.number ?? "").includes(q)
    );
  }, [players, search]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(0,0,0,.04)" }} />
        ))}
      </div>
    );
  }

  if (!season) {
    return (
      <p className="py-12 text-center text-[13px]" style={{ color: "var(--muted-text,#5A6478)" }}>
        Seleciona uma temporada
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Pesquisa */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "rgba(0,0,0,.3)" }} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar jogador…"
          className="w-full h-11 rounded-xl pl-10 pr-4 text-[15px] outline-none"
          style={{
            background: "var(--paper,#F6F7F9)",
            border: "1px solid var(--line,#E4E7EE)",
            color: "var(--text,#0F1729)",
          }}
        />
      </div>

      {/* Cabeçalho dos meses — scroll horizontal se necessário */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <div style={{ minWidth: 160 }} />
        {months.map((m) => {
          const isCurrent = m.month === today.getMonth() + 1 && m.year === today.getFullYear();
          return (
            <div
              key={`${m.month}-${m.year}`}
              className="shrink-0 text-center"
              style={{ minWidth: 28 }}
            >
              <span
                className="text-[10px] font-bold uppercase"
                style={{ color: isCurrent ? "var(--action,#F97316)" : "rgba(0,0,0,.3)" }}
              >
                {MONTH_NAMES_SHORT[m.month - 1]}
              </span>
            </div>
          );
        })}
        <div style={{ minWidth: 64 }} />
      </div>

      {/* Linhas de jogadores */}
      {filtered.map((player) => {
        const playerPays = payIndex.get(player.player_id ?? "");
        const sum        = sumIndex.get(player.player_id ?? "");
        const emFalta    = sum ? Math.max(0, Number(sum.total_due) - Number(sum.total_paid)) : 0;

        const cells: Array<GridCell & { month: number; year: number }> = months.map((m) => {
          const pay  = playerPays?.get(`${m.month}-${m.year}`) ?? null;
          const cell = deriveCellState(m.month, m.year, pay, today);
          return { ...cell, month: m.month, year: m.year };
        });

        const hasLate = cells.some((c) => c.status === "late" || c.status === "unregistered");

        return (
          <button
            key={player.user_id}
            type="button"
            onClick={() => onPlayer(player)}
            className="w-full flex items-center gap-3 rounded-2xl p-3 text-left transition-colors active:opacity-70"
            style={{
              background: "var(--paper,#F6F7F9)",
              border: `1px solid ${hasLate ? "rgba(217,45,32,.15)" : "var(--line,#E4E7EE)"}`,
              touchAction: "manipulation",
              minHeight: 64,
            }}
          >
            {/* Avatar */}
            <div
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold"
              style={{ background: "rgba(10,18,32,.08)", color: "var(--ink,#0A1220)" }}
            >
              {initials(player.name)}
            </div>

            {/* Nome + número */}
            <div className="shrink-0" style={{ minWidth: 100 }}>
              <p className="text-[14px] font-semibold truncate" style={{ color: "var(--ink,#0A1220)" }}>
                {player.name}
              </p>
              {player.number && (
                <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
                  #{player.number}
                </p>
              )}
            </div>

            {/* Dots de estado — 1 por mês */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: "none" }}>
              {cells.map((cell) => (
                <button
                  key={`${cell.month}-${cell.year}`}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDot(player, cell.month, cell.year); }}
                  className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
                  style={{
                    background: CELL_COLORS[cell.status].bg,
                    minWidth: 24,
                    touchAction: "manipulation",
                  }}
                  aria-label={`${MONTH_NAMES_SHORT[cell.month - 1]} ${cell.year}: ${cell.status}`}
                  title={`${MONTH_NAMES_SHORT[cell.month - 1]} ${cell.year}`}
                />
              ))}
            </div>

            {/* Em falta */}
            <div className="shrink-0 text-right ml-2">
              {emFalta > 0 ? (
                <span className="text-[13px] font-bold" style={{ color: "var(--bad,#D92D20)" }}>
                  -{formatCurrencyEUR(emFalta)}
                </span>
              ) : (
                <span className="text-[13px] font-bold" style={{ color: "var(--ok,#12855B)" }}>
                  ✓
                </span>
              )}
            </div>
          </button>
        );
      })}

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[13px]" style={{ color: "var(--muted-text,#5A6478)" }}>
          Nenhum jogador encontrado
        </p>
      )}
    </div>
  );
}
