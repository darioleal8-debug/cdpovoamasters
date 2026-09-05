"use client";

import { useState, useMemo, useRef } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { usePlayers } from "@/hooks/use-players";
import { useGames } from "@/hooks/use-games";
import { usePayments } from "@/hooks/use-payments";
import { useSeasonStats, type StatsFilter, DEFAULT_STATS_FILTER } from "@/hooks/use-season-stats";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { PaymentsChart } from "@/components/dashboard/payments-chart";
import { PositionsChart } from "@/components/dashboard/positions-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart3, Calendar, CreditCard, Users,
  Trophy, TrendingUp, CheckCircle2, AlertCircle,
} from "lucide-react";
import type { AttendanceDataPoint, PaymentDataPoint, PositionCount } from "@/types/database";

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const POS_LABELS: Record<string, string> = { base: "Base", extremo: "Extremo", poste: "Poste" };

export default function EstatisticasPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { players, loading: playersLoading }                             = usePlayers(seasonId);
  const { events,  loading: eventsLoading }                              = useGames(seasonId);
  const { payments, totalPago, totalPendente, loading: paymentsLoading } = usePayments(seasonId);

  // ── Filtro de estatísticas desportivas ──────────────────────────────────────
  const [statsFilter, setStatsFilter] = useState<StatsFilter>(DEFAULT_STATS_FILTER);

  const { stats: gameStats, loading: statsLoading } = useSeasonStats(seasonId, statsFilter);

  // Each section has its own loading flag — statsLoading must NOT block the basic metrics
  const basicLoading    = eventsLoading;
  const playersLoading_ = statsLoading;   // player count comes from players table via useSeasonStats
  const posLoading      = playersLoading; // position distribution still comes from player_profiles

  /* ── Calendário por mês ──────────────────────────────── */
  const attendanceData = useMemo<AttendanceDataPoint[]>(() => {
    const map = new Map<string, { jogos: number; treinos: number }>();
    for (const ev of events) {
      const m = MONTH_ABBR[new Date(ev.event_date).getMonth()];
      const e = map.get(m) ?? { jogos: 0, treinos: 0 };
      if (ev.type === "jogo") e.jogos++; else if (ev.type === "treino") e.treinos++;
      map.set(m, e);
    }
    return Array.from(map.entries()).map(([month, v]) => ({ month, ...v }));
  }, [events]);

  /* ── Pagamentos por mês (últimos 8) ──────────────────── */
  const paymentsChartData = useMemo<PaymentDataPoint[]>(() => {
    const map = new Map<string, { pago: number; pendente: number }>();
    for (const p of payments) {
      const key = `${MONTH_ABBR[p.month - 1]}/${String(p.reference_year).slice(2)}`;
      const e = map.get(key) ?? { pago: 0, pendente: 0 };
      if (p.status === "pago") e.pago += Number(p.amount); else e.pendente += Number(p.amount);
      map.set(key, e);
    }
    return Array.from(map.entries()).slice(-8).map(([month, v]) => ({ month, ...v }));
  }, [payments]);

  /* ── Resumo financeiro do mês corrente ───────────────── */
  const paymentSummary = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();

    const thisMonthPaid = payments
      .filter(p => p.month === m && p.reference_year === y && p.status === "pago")
      .reduce((s, p) => s + Number(p.amount), 0);

    const playersInDay = new Set(
      payments
        .filter(p => p.month === m && p.reference_year === y && p.status === "pago")
        .map(p => p.user_id)
    ).size;

    const playersOverdue = new Set(
      payments
        .filter(p => {
          const isPast = p.reference_year < y || (p.reference_year === y && p.month <= m);
          return p.status === "pendente" && isPast;
        })
        .map(p => p.user_id)
    ).size;

    return { thisMonthPaid, playersInDay, playersOverdue };
  }, [payments]);

  /* ── Distribuição de posições (inclui "Sem posição") ─── */
  const positionsData = useMemo<PositionCount[]>(() => {
    const map: Record<string, number> = {};
    for (const p of players) {
      const key = p.position ?? "__none__";
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({
      name: name === "__none__" ? "Sem posição" : (POS_LABELS[name] ?? name),
      value,
      fill: "",
    }));
  }, [players]);

  const totalGames     = events.filter(e => e.type === "jogo").length;
  const totalTrainings = events.filter(e => e.type === "treino").length;

  // Tabs de secção (mobile)
  type Tab = "equipa" | "desportivo" | "financeiro";
  const [activeTab, setActiveTab] = useState<Tab>("equipa");
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "equipa",      label: "Equipa" },
    { id: "desportivo",  label: "Desportivo" },
    { id: "financeiro",  label: "Financeiro" },
  ];

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho (1 linha mobile) ─────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-condensed font-bold text-2xl uppercase tracking-display"
          style={{ color: "var(--ink,#0A1220)" }}>
          Estatísticas
        </h1>
        <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
          <SelectTrigger className="w-36 md:w-48 h-9 text-sm">
            <SelectValue placeholder="Temporada" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.status === "ativa" ? "✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Chips de tab (mobile) — scroll horizontal ──────────── */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className="shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold transition-colors"
            style={{
              background: activeTab === t.id ? "var(--ink,#0A1220)" : "var(--paper,#F6F7F9)",
              color:      activeTab === t.id ? "#fff" : "var(--muted-text,#5A6478)",
              border:     `1px solid ${activeTab === t.id ? "transparent" : "var(--line,#E4E7EE)"}`,
              touchAction: "manipulation",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Bloco 1: Equipa & Calendário ──────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "equipa" ? "hidden md:block" : "",
        ].join(" ")}
      >
        {/* Label (só tablet+) */}
        <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Equipa &amp; Calendário
        </p>
        {/* Métricas 2×2 mobile, 4 cols tablet+ */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <MetricCard title="Jogadores" value={gameStats?.total_players ?? 0}
            description="No plantel" icon={Users} accent="blue" loading={playersLoading_} />
          <MetricCard title="Jogos" value={totalGames}
            description="Total na temporada" icon={Calendar} accent="blue" loading={basicLoading} />
          <MetricCard title="Treinos" value={totalTrainings}
            description="Sessões marcadas" icon={BarChart3} accent="amber" loading={basicLoading} />
          <MetricCard title="c/ Stats" value={gameStats?.games_finished ?? 0}
            description="Jogos com estatísticas" icon={Trophy} accent="blue" loading={statsLoading} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <AttendanceChart data={attendanceData} loading={basicLoading} />
          </div>
          <PositionsChart data={positionsData} loading={posLoading} />
        </div>
      </section>

      {/* ── Bloco 2: Desportivo ────────────────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "desportivo" ? "hidden md:block" : "",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Estatísticas Desportivas
          </p>
          {/* Filtro: Todos / Oficial / Treino / competição específica */}
          <div className="flex flex-wrap gap-2">
            {/* gameType filter */}
            <Select
              value={statsFilter.gameType}
              onValueChange={(v) =>
                setStatsFilter((f) => ({ ...f, gameType: v as StatsFilter["gameType"], competition: undefined }))
              }
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os jogos</SelectItem>
                <SelectItem value="official">Jogos Oficiais</SelectItem>
                <SelectItem value="friendly">Jogos de Treino</SelectItem>
              </SelectContent>
            </Select>
            {/* Competition filter — only when showing official games */}
            {statsFilter.gameType !== "friendly" && (
              <Select
                value={statsFilter.competition ?? "__all__"}
                onValueChange={(v) =>
                  setStatsFilter((f) => ({ ...f, competition: v === "__all__" ? undefined : v, gameType: v !== "__all__" ? "official" : f.gameType }))
                }
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Competição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as comp.</SelectItem>
                  <SelectItem value="Liga">Liga</SelectItem>
                  <SelectItem value="Taça">Taça</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : !gameStats || gameStats.games_finished === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum jogo terminado com estatísticas registadas.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              { label: "Pontos",      value: gameStats.total_pts },
              { label: "Ressaltos",   value: gameStats.total_reb },
              { label: "Assist.",     value: gameStats.total_ast },
              { label: "Roubos",      value: gameStats.total_stl },
              { label: "Desarmes",    value: gameStats.total_blk },
              { label: "Turnovers",   value: gameStats.total_tov },
              { label: "F. Dadas",    value: gameStats.total_fouls_committed },
              { label: "F. Sofridas", value: gameStats.total_fouls_drawn },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="py-4 px-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className="text-2xl font-black tabular-nums">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Bloco 3: Financeiro ────────────────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "financeiro" ? "hidden md:block" : "",
        ].join(" ")}
      >
        <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Financeiro
        </p>
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <MetricCard title="Receita Total" value={formatCurrency(totalPago)}
            description={`Pendente: ${formatCurrency(totalPendente)}`}
            icon={CreditCard} accent={totalPendente > 0 ? "red" : "green"} loading={paymentsLoading} />
          <MetricCard title="Pago este Mês" value={formatCurrency(paymentSummary.thisMonthPaid)}
            description={`${MONTH_ABBR[new Date().getMonth()]} ${new Date().getFullYear()}`}
            icon={TrendingUp} accent="green" loading={paymentsLoading} />
          <MetricCard title="Em Dia" value={paymentSummary.playersInDay}
            description="Pagos este mês" icon={CheckCircle2} accent="green" loading={paymentsLoading} />
          <MetricCard title="Em Atraso" value={paymentSummary.playersOverdue}
            description="Com quotas em atraso"
            icon={AlertCircle} accent={paymentSummary.playersOverdue > 0 ? "red" : "green"}
            loading={paymentsLoading} />
        </div>
        <PaymentsChart data={paymentsChartData} loading={paymentsLoading} />
      </section>

    </div>
  );
}
