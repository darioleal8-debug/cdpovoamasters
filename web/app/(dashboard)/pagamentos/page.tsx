"use client";

import { useState, useMemo } from "react";
import { Euro, AlertCircle, TrendingUp, Users } from "lucide-react";
import { useSeasons }           from "@/hooks/use-seasons";
import { useRoster }            from "@/hooks/use-roster";
import { usePlayerPayments }    from "@/hooks/use-player-payments";
import { PlayerPaymentsTable }  from "@/components/payments/player-payments-table";
import { RegisterPaymentModal, type SavePaymentData } from "@/components/payments/register-payment-modal";
import { PlayerHistoryModal }   from "@/components/payments/player-history-modal";
import { Card, CardContent }    from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Player, Season }  from "@/types/database";
import { formatCurrencyEUR }    from "@/lib/payment-utils";

export default function PagamentosPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;
  const season   = useMemo(
    () => seasons.find((s) => s.id === seasonId) ?? null,
    [seasons, seasonId]
  );

  const { players, loading: playersLoading } = useRoster(seasonId);
  const {
    payments, summary, loading: paymentsLoading,
    totalPaid, totalMissing, playersLate,
    upsertPayment, updatePayment, deletePayment,
  } = usePlayerPayments(seasonId);

  const loading = playersLoading || paymentsLoading;

  // ── Estado do modal de edição ──────────────────────────
  const [registerOpen,   setRegisterOpen]   = useState(false);
  const [registerPlayer, setRegisterPlayer] = useState<Player | null>(null);
  const [registerMonth,  setRegisterMonth]  = useState<number | undefined>();
  const [registerYear,   setRegisterYear]   = useState<number | undefined>();

  function openRegister(player: Player, month?: number, year?: number) {
    setRegisterPlayer(player);
    setRegisterMonth(month);
    setRegisterYear(year);
    setRegisterOpen(true);
  }

  // Pagamento existente para o player+mês seleccionado
  const existingPayment = useMemo(() => {
    if (!registerPlayer || !registerMonth || !registerYear) return undefined;
    return payments.find(
      (p) =>
        p.player_id      === registerPlayer.id &&
        p.month          === registerMonth &&
        p.reference_year === registerYear
    );
  }, [payments, registerPlayer, registerMonth, registerYear]);

  // Guardar: PUT se já existe, POST (upsert) se é novo
  async function handleSave(data: SavePaymentData): Promise<boolean> {
    if (!seasonId) return false;
    if (existingPayment) {
      return updatePayment(existingPayment.id, data);
    }
    return upsertPayment({ ...data, season_id: seasonId });
  }

  // Eliminar o pagamento existente
  async function handleDelete(): Promise<boolean> {
    if (!existingPayment) return false;
    return deletePayment(existingPayment.id);
  }

  // ── Estado do modal de histórico ───────────────────────
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);

  const historyPayments = useMemo(
    () => (historyPlayer ? payments.filter((p) => p.player_id === historyPlayer.id) : []),
    [payments, historyPlayer]
  );
  const historySummary = useMemo(
    () => (historyPlayer ? summary.find((s) => s.player_id === historyPlayer.id) : undefined),
    [summary, historyPlayer]
  );

  function openHistory(player: Player) {
    setHistoryPlayer(player);
    setHistoryOpen(true);
  }

  // Editar a partir do modal de histórico: fechar histórico → abrir edição
  function handleEditFromHistory(month: number, year: number) {
    if (!historyPlayer) return;
    setHistoryOpen(false);
    // Pequeno delay para evitar sobreposição de modais
    setTimeout(() => openRegister(historyPlayer, month, year), 120);
  }

  // ── Marcar Pago rápido ─────────────────────────────────
  async function handleMarkPaid(player: Player, month: number, year: number) {
    if (!seasonId) return;
    const existing = payments.find(
      (p) => p.player_id === player.id && p.month === month && p.reference_year === year
    );
    if (existing) {
      await updatePayment(existing.id, { amount: existing.amount_due, status: "paid", payment_date: new Date().toISOString().slice(0, 10) });
    } else {
      await upsertPayment({
        season_id: seasonId, player_id: player.id, month, reference_year: year,
        amount: 20, amount_due: 20, status: "paid",
        payment_date: new Date().toISOString().slice(0, 10),
      });
    }
  }

  // ── Totais ─────────────────────────────────────────────
  const totalDueAll   = summary.reduce((s, r) => s + Number(r.total_due), 0);
  const compliancePct = totalDueAll > 0 ? Math.round((totalPaid / totalDueAll) * 100) : null;

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
          <p className="text-muted-foreground">Gestão de quotas mensais dos jogadores</p>
        </div>
        <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Selecionar temporada" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s: Season) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.status === "ativa" ? "✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Cards de resumo ────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Euro        className="h-5 w-5" />} label="Total Recebido"    value={formatCurrencyEUR(totalPaid)}   color="green" />
        <SummaryCard icon={<AlertCircle className="h-5 w-5" />} label="Total em Falta"    value={formatCurrencyEUR(totalMissing)} color="red"   />
        <SummaryCard icon={<TrendingUp  className="h-5 w-5" />} label="Taxa Cumprimento"  value={compliancePct != null ? `${compliancePct}%` : "—"} color="blue" />
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          label="Em Atraso"
          value={`${playersLate} jogador${playersLate !== 1 ? "es" : ""}`}
          color={playersLate > 0 ? "red" : "green"}
        />
      </div>

      {/* ── Tabela de pagamentos ──────────────────────────── */}
      <PlayerPaymentsTable
        players={players}
        payments={payments}
        summary={summary}
        loading={loading}
        season={season}
        onRegister={openRegister}
        onHistory={openHistory}
        onMarkPaid={handleMarkPaid}
      />

      {/* ── Modal: Registar / Editar Pagamento ────────────── */}
      <RegisterPaymentModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSave={handleSave}
        onDelete={existingPayment ? handleDelete : undefined}
        players={players}
        season={season}
        prefill={{
          playerId:        registerPlayer?.id,
          month:           registerMonth,
          year:            registerYear,
          existingPayment: existingPayment,
        }}
      />

      {/* ── Modal: Histórico ──────────────────────────────── */}
      <PlayerHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        player={historyPlayer}
        payments={historyPayments}
        summary={historySummary}
        season={season}
        onEdit={handleEditFromHistory}
      />
    </div>
  );
}

// ── Card de resumo ─────────────────────────────────────────

function SummaryCard({
  icon, label, value, color,
}: {
  icon:  React.ReactNode;
  label: string;
  value: string;
  color: "green" | "red" | "blue";
}) {
  const map = {
    green: { border: "border-t-green-500",     text: "text-green-700",     icon: "bg-green-50 text-green-600" },
    red:   { border: "border-t-red-500",        text: "text-red-700",       icon: "bg-red-50 text-red-600"     },
    blue:  { border: "border-t-cdpovoa-blue",   text: "text-cdpovoa-blue",  icon: "bg-cdpovoa-blue/10 text-cdpovoa-blue" },
  }[color];

  return (
    <Card className={`border-t-4 ${map.border}`}>
      <CardContent className="flex items-center gap-3 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${map.icon}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-bold ${map.text}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
