"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useSeasons }          from "@/hooks/use-seasons";
import { useRoster }           from "@/hooks/use-roster";
import { usePlayerPayments }   from "@/hooks/use-player-payments";
import { PaymentsIndicators }  from "@/components/payments/payments-indicators";
import { PaymentsGrid }        from "@/components/payments/payments-grid";
import { PaymentsPlayerList }  from "@/components/payments/payments-player-list";
import { CellPopover }         from "@/components/payments/cell-popover";
import type { ActiveCellInfo } from "@/components/payments/cell-popover";
import {
  RegisterPaymentModal,
  type SavePaymentData,
} from "@/components/payments/register-payment-modal";
import { PlayerHistoryModal }  from "@/components/payments/player-history-modal";
import { Button }              from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { RosterEntry, Season } from "@/types/database";
import {
  getSeasonMonths, deriveCellState, MONTH_NAMES_SHORT,
  formatCurrencyEUR,
} from "@/lib/payment-utils";
import type { IndicatorValues } from "@/components/payments/payments-indicators";

export default function PagamentosPage() {
  // ── Data ────────────────────────────────────────────────────────────────
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;
  const season   = useMemo(
    () => seasons.find(s => s.id === seasonId) ?? null,
    [seasons, seasonId]
  );

  const { players, loading: playersLoading } = useRoster(seasonId);
  const {
    payments, summary, loading: paymentsLoading,
    upsertPayment, updatePayment, deletePayment,
  } = usePlayerPayments(seasonId);

  const loading = playersLoading || paymentsLoading;

  // ── Cell popover ────────────────────────────────────────────────────────
  const [activeCell, setActiveCell] = useState<ActiveCellInfo | null>(null);

  // ── Register modal ──────────────────────────────────────────────────────
  const [registerOpen,   setRegisterOpen]   = useState(false);
  const [registerPlayer, setRegisterPlayer] = useState<RosterEntry | null>(null);
  const [registerMonth,  setRegisterMonth]  = useState<number | undefined>();
  const [registerYear,   setRegisterYear]   = useState<number | undefined>();

  function openRegister(player?: RosterEntry | null, month?: number, year?: number) {
    setRegisterPlayer(player ?? null);
    setRegisterMonth(month);
    setRegisterYear(year);
    setRegisterOpen(true);
  }

  const existingPayment = useMemo(() => {
    if (!registerPlayer || !registerMonth || !registerYear) return undefined;
    return payments.find(
      p => p.player_id === registerPlayer.player_id &&
           p.month === registerMonth &&
           p.reference_year === registerYear
    );
  }, [payments, registerPlayer, registerMonth, registerYear]);

  async function handleSave(data: SavePaymentData): Promise<boolean> {
    if (!seasonId) return false;
    if (existingPayment) return updatePayment(existingPayment.id, data);
    return upsertPayment({ ...data, season_id: seasonId });
  }

  async function handleDelete(): Promise<boolean> {
    if (!existingPayment) return false;
    return deletePayment(existingPayment.id);
  }

  // ── History modal ───────────────────────────────────────────────────────
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [historyPlayer, setHistoryPlayer] = useState<RosterEntry | null>(null);

  const historyPayments = useMemo(
    () => historyPlayer ? payments.filter(p => p.player_id === historyPlayer.player_id) : [],
    [payments, historyPlayer]
  );
  const historySummary = useMemo(
    () => historyPlayer ? summary.find(s => s.player_id === historyPlayer.id) : undefined,
    [summary, historyPlayer]
  );

  function handleEditFromHistory(month: number, year: number) {
    if (!historyPlayer) return;
    setHistoryOpen(false);
    setTimeout(() => openRegister(historyPlayer, month, year), 120);
  }

  // ── Indicators: derived client-side ────────────────────────────────────
  const indicators = useMemo<IndicatorValues>(() => {
    const today      = new Date();
    const months     = season ? getSeasonMonths(season) : [];
    const thisMonth  = new Date(today.getFullYear(), today.getMonth(), 1);
    const pastMonths = months.filter(m => new Date(m.year, m.month - 1, 1) <= thisMonth);

    let recebido = 0, previsto = 0;
    let quotasAtraso = 0;
    const lateByPlayer = new Set<string>();
    const missedByMonth = new Map<string, number>();
    let totalLagMs = 0, lagCount = 0;

    for (const m of pastMonths) {
      for (const player of players) {
        const pay = payments.find(
          p => p.player_id === player.player_id && p.month === m.month && p.reference_year === m.year
        );
        const cell = deriveCellState(m.month, m.year, pay ?? null, today);

        if (cell.status === "exempt") continue;

        previsto  += cell.amountDue;
        recebido  += cell.amountPaid;

        if (cell.status === "late" || cell.status === "unregistered") {
          quotasAtraso++;
          if (player.player_id) lateByPlayer.add(player.player_id);
          const key = `${m.month}-${m.year}`;
          missedByMonth.set(key, (missedByMonth.get(key) ?? 0) + 1);
          const dueDate = new Date(m.year, m.month - 1, 1);
          totalLagMs += today.getTime() - dueDate.getTime();
          lagCount++;
        }
      }
    }

    const taxaPct = previsto > 0 ? Math.round((recebido / previsto) * 100) : null;
    const atrasoMedioDias = lagCount > 0 ? totalLagMs / lagCount / 86_400_000 : null;

    let piorMes: string | null = null;
    let piorCount = 0;
    for (const [key, count] of missedByMonth) {
      if (count > piorCount) {
        piorCount = count;
        const [month, year] = key.split("-").map(Number);
        piorMes = `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
      }
    }

    return {
      recebido,
      previsto,
      emFalta:         Math.max(0, previsto - recebido),
      taxaPct,
      jogadoresAtraso: lateByPlayer.size,
      quotasAtraso,
      atrasoMedioDias,
      piorMes,
    };
  }, [players, payments, season]);

  // ── Season subtitle ─────────────────────────────────────────────────────
  const subtitle = useMemo(() => {
    if (!season) return "Seleciona uma temporada";
    const nPlayers = players.length;
    return `${season.name} · quotas mensais · ${nPlayers} jogador${nPlayers !== 1 ? "es" : ""}`;
  }, [season, players.length]);

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho (1 linha mobile, 2 colunas tablet+) ────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-condensed font-bold text-2xl uppercase tracking-display truncate"
            style={{ color: "var(--ink,#0A1220)" }}>
            Pagamentos
          </h1>
          <p className="text-[12px] truncate" style={{ color: "var(--muted-text,#5A6478)" }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={seasonId ?? ""}
            onValueChange={setSelectedSeasonId}
            disabled={seasonsLoading}
          >
            <SelectTrigger className="w-36 md:w-44 h-9 text-sm">
              <SelectValue placeholder="Temporada" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s: Season) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}{s.status === "ativa" ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Botão visível só a partir de tablet — em mobile usa FAB */}
          <Button
            className="hidden md:flex h-9 gap-1.5"
            onClick={() => openRegister()}
            disabled={!seasonId}
          >
            + Registar
          </Button>
        </div>
      </div>

      {/* ── Indicadores ──────────────────────────────────────────────── */}
      <PaymentsIndicators values={indicators} loading={loading} />

      {/* ── Grelha (tablet+) — lista (mobile) ────────────────────────── */}

      {/* Mobile: lista por jogador com dots */}
      <div className="md:hidden">
        <PaymentsPlayerList
          players={players}
          payments={payments}
          summary={summary}
          loading={loading}
          season={season}
          onPlayer={(player) => { setHistoryPlayer(player); setHistoryOpen(true); }}
          onDot={(player, month, year) => openRegister(player, month, year)}
        />
      </div>

      {/* Tablet+: grelha original */}
      <div className="hidden md:block">
        <PaymentsGrid
          players={players}
          payments={payments}
          summary={summary}
          loading={loading}
          season={season}
          onCellClick={info => setActiveCell(info)}
          onHistory={player => { setHistoryPlayer(player); setHistoryOpen(true); }}
        />
      </div>

      {/* ── Popover de célula (só tablet+) ───────────────────────────── */}
      {seasonId && (
        <CellPopover
          active={activeCell}
          seasonId={seasonId}
          onClose={() => setActiveCell(null)}
          onQuickSave={async data => {
            const existingId = activeCell?.cell.payment?.id;
            const ok = existingId
              ? await updatePayment(existingId, data)
              : await upsertPayment(data);
            if (ok) setActiveCell(null);
            return ok;
          }}
          onOpenEdit={(player, month, year) => openRegister(player, month, year)}
        />
      )}

      {/* ── Modal: Registar / Editar (partilhado mobile + tablet) ────── */}
      <RegisterPaymentModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSave={handleSave}
        onDelete={existingPayment ? handleDelete : undefined}
        players={players}
        season={season}
        prefill={{
          playerId:        registerPlayer?.player_id ?? undefined,
          month:           registerMonth,
          year:            registerYear,
          existingPayment: existingPayment,
        }}
      />

      {/* ── Modal: Histórico ──────────────────────────────────────────── */}
      <PlayerHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        player={historyPlayer}
        payments={historyPayments}
        summary={historySummary}
        season={season}
        onEdit={handleEditFromHistory}
      />

      {/* ── FAB mobile "+ Registar" — acima da bottom-nav ────────────── */}
      <button
        type="button"
        onClick={() => openRegister()}
        disabled={!seasonId}
        aria-label="Registar pagamento"
        className="md:hidden fixed right-4 z-40 flex items-center gap-2 h-14 px-5 rounded-full shadow-lg font-semibold text-sm transition-opacity disabled:opacity-40"
        style={{
          bottom: "calc(var(--bottom-nav-h, 56px) + 12px)",
          background: "var(--action,#F97316)",
          color: "#fff",
          touchAction: "manipulation",
        }}
      >
        <Plus className="h-5 w-5" />
        Registar
      </button>
    </div>
  );
}
