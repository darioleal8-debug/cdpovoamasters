"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSeasons } from "@/hooks/use-seasons";
import { useRosterPlayers } from "@/hooks/use-players";
import { useGames } from "@/hooks/use-games";
import { useMyQuota } from "@/hooks/use-my-quota";
import { useSeasonStats, type StatsFilter, DEFAULT_STATS_FILTER } from "@/hooks/use-season-stats";
import { useTrainings } from "@/hooks/use-trainings";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { PositionsChart } from "@/components/dashboard/positions-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AttendanceTab } from "@/components/stats/attendance-tab";
import { TrainingStatsTab } from "@/components/stats/training-stats-tab";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart3, Calendar, CreditCard, Users,
  Trophy, CheckCircle2, AlertCircle,
} from "lucide-react";
import type { AttendanceDataPoint, PositionCount } from "@/types/database";

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const POS_LABELS: Record<string, string> = { base: "Base", extremo: "Extremo", poste: "Poste" };

export default function PlayerEstatisticasPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { players, loading: playersLoading }    = useRosterPlayers(seasonId);
  const { events,  loading: eventsLoading }     = useGames(seasonId);
  const { trainings, loading: trainingsLoading } = useTrainings(seasonId);
  const { payments: myPayments, summary: quotaSummary, loading: quotaLoading } = useMyQuota(seasonId);

  const [statsFilter, setStatsFilter] = useState<StatsFilter>(DEFAULT_STATS_FILTER);
  const { stats: gameStats, loading: statsLoading } = useSeasonStats(seasonId, statsFilter);

  const basicLoading = eventsLoading || trainingsLoading;
  const posLoading   = playersLoading;

  const attendanceData = useMemo<AttendanceDataPoint[]>(() => {
    const map = new Map<string, { jogos: number; treinos: number }>();
    for (const t of trainings) {
      const m = MONTH_ABBR[new Date(t.date + "T00:00:00").getMonth()];
      const e = map.get(m) ?? { jogos: 0, treinos: 0 };
      e.treinos++;
      map.set(m, e);
    }
    for (const ev of events) {
      if (ev.type !== "jogo") continue;
      const m = MONTH_ABBR[new Date(ev.event_date).getMonth()];
      const e = map.get(m) ?? { jogos: 0, treinos: 0 };
      e.jogos++;
      map.set(m, e);
    }
    return Array.from(map.entries()).map(([month, v]) => ({ month, ...v }));
  }, [events, trainings]);

  const positionsData = useMemo<PositionCount[]>(() => {
    const map: Record<string, number> = {};
    for (const p of players) {
      const key = p.position ?? "__none__";
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({
      name:  name === "__none__" ? "Sem posição" : (POS_LABELS[name] ?? name),
      value,
      fill:  "",
    }));
  }, [players]);

  const totalGames     = events.filter((e) => e.type === "jogo").length;
  const totalTrainings = trainings.length;
  const today          = new Date().toISOString().slice(0, 10);
  const trainingsCompleted = trainings.filter((t) => t.date < today).length;

  const pendingCount = myPayments.filter((p) => p.status === "pendente").length;
  const paidCount    = myPayments.filter((p) => p.status === "pago").length;

  type Tab = "equipa" | "desportivo" | "financeiro" | "assiduidade" | "treinos";
  const [activeTab, setActiveTab] = useState<Tab>("equipa");
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "equipa",      label: "Equipa" },
    { id: "desportivo",  label: "Desportivo" },
    { id: "financeiro",  label: "Financeiro" },
    { id: "assiduidade", label: "Assiduidade" },
    { id: "treinos",     label: "Treinos" },
  ];

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <h1
          className="font-condensed font-bold text-2xl uppercase tracking-display"
          style={{ color: "var(--ink,#0A1220)" }}
        >
          Estatísticas
        </h1>
        <Select
          value={seasonId ?? ""}
          onValueChange={setSelectedSeasonId}
          disabled={seasonsLoading}
        >
          <SelectTrigger className="w-36 md:w-48 h-9 text-sm">
            <SelectValue placeholder="Temporada" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.status === "ativa" ? "✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Tab chips (mobile) ─────────────────────────────────────────────────── */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className="shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold transition-colors"
            style={{
              background:  activeTab === t.id ? "var(--ink,#0A1220)" : "var(--paper,#F6F7F9)",
              color:       activeTab === t.id ? "#fff" : "var(--muted-text,#5A6478)",
              border:      `1px solid ${activeTab === t.id ? "transparent" : "var(--line,#E4E7EE)"}`,
              touchAction: "manipulation",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Equipa & Calendário ───────────────────────────────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "equipa" ? "hidden md:block" : "",
        ].join(" ")}
      >
        <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Equipa &amp; Calendário
        </p>
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <MetricCard title="Jogadores"  value={gameStats?.total_players ?? 0}
            description="No plantel"               icon={Users}    accent="blue"  loading={statsLoading} />
          <MetricCard title="Jogos"      value={totalGames}
            description="Total na temporada"       icon={Calendar} accent="blue"  loading={basicLoading} />
          <MetricCard title="Treinos"    value={totalTrainings}
            description={trainingsCompleted > 0 ? `${trainingsCompleted} realizado(s)` : "Sessões marcadas"}
            icon={BarChart3} accent="amber" loading={basicLoading} />
          <MetricCard title="c/ Stats"   value={gameStats?.games_finished ?? 0}
            description="Jogos com estatísticas"   icon={Trophy}   accent="blue"  loading={statsLoading} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <AttendanceChart data={attendanceData} loading={basicLoading} />
          </div>
          <PositionsChart data={positionsData} loading={posLoading} />
        </div>
      </section>

      {/* ── Desportivo ───────────────────────────────────────────────────────── */}
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
          <div className="flex flex-wrap gap-2">
            <Select
              value={statsFilter.gameType}
              onValueChange={(v) =>
                setStatsFilter((f) => ({ ...f, gameType: v as StatsFilter["gameType"], competition: undefined }))
              }
            >
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os jogos</SelectItem>
                <SelectItem value="official">Jogos Oficiais</SelectItem>
                <SelectItem value="friendly">Jogos de Treino</SelectItem>
              </SelectContent>
            </Select>
            {statsFilter.gameType !== "friendly" && (
              <Select
                value={statsFilter.competition ?? "__all__"}
                onValueChange={(v) =>
                  setStatsFilter((f) => ({
                    ...f,
                    competition: v === "__all__" ? undefined : v,
                    gameType:    v !== "__all__" ? "official" : f.gameType,
                  }))
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
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
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

      {/* ── Financeiro — apenas as minhas quotas ─────────────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "financeiro" ? "hidden md:block" : "",
        ].join(" ")}
      >
        <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          As Minhas Quotas
        </p>
        <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3">
          <MetricCard
            title="Pagas"
            value={paidCount}
            description="Meses liquidados"
            icon={CheckCircle2}
            accent="green"
            loading={quotaLoading}
          />
          <MetricCard
            title="Pendentes"
            value={pendingCount}
            description="Meses em falta"
            icon={AlertCircle}
            accent={pendingCount > 0 ? "red" : "green"}
            loading={quotaLoading}
          />
          <MetricCard
            title="Total Pago"
            value={formatCurrency(quotaSummary.paid)}
            description="Valor liquidado"
            icon={CreditCard}
            accent="blue"
            loading={quotaLoading}
          />
        </div>

        {quotaLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : myPayments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Sem quotas registadas para esta temporada.
            </CardContent>
          </Card>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--line,#E4E7EE)" }}
          >
            {myPayments.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: idx > 0 ? "1px solid var(--line,#E4E7EE)" : undefined }}
              >
                <div>
                  <p className="text-[13px] font-medium">
                    {MONTH_ABBR[p.month - 1]} {p.reference_year}
                  </p>
                  {p.paid_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Pago em {new Date(p.paid_at).toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-bold tabular-nums">
                    {formatCurrency(Number(p.amount))}
                  </span>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: p.status === "pago" ? "rgba(22,163,74,.1)" : "rgba(217,45,32,.1)",
                      color:      p.status === "pago" ? "var(--good,#16A34A)"  : "var(--bad,#D92D20)",
                    }}
                  >
                    {p.status === "pago" ? "Pago" : "Pendente"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Assiduidade ──────────────────────────────────────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "assiduidade" ? "hidden md:block" : "",
        ].join(" ")}
      >
        <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Assiduidade
        </p>
        <AttendanceTab
          seasonId={seasonId}
        />
      </section>

      {/* ── Treinos ──────────────────────────────────────────────────────────── */}
      <section
        className={[
          "space-y-4",
          activeTab !== "treinos" ? "hidden md:block" : "",
        ].join(" ")}
      >
        <p className="hidden md:block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Estatísticas de Treinos
        </p>
        <TrainingStatsTab seasonId={seasonId} />
      </section>

    </div>
  );
}
