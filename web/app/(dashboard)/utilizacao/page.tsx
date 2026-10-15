"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Users, Activity, TrendingUp, Clock, Award, Globe } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  total_users: number;
  active_users: number;
  active_today: number;
  active_week: number;
  active_month: number;
  total_events: number;
}

interface ChartPoint   { date?: string; label?: string; count: number }
interface PageRow       { page: string; count: number }
interface UserRow {
  id: string; name: string; email: string; role: string; active: boolean;
  events_period: number; last_seen: string | null; last_login: string | null;
}

interface DashboardData {
  period_days:   number;
  overview:      Overview;
  daily_chart:   ChartPoint[];
  dow_chart:     (ChartPoint & { label: string })[];
  monthly_chart: (ChartPoint & { label: string })[];
  page_ranking:  PageRow[];
  users:         UserRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", treinador: "Treinador", jogador: "Jogador",
  seccionista: "Seccionista", tesoureiro: "Tesoureiro",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 2)  return "Agora mesmo";
  if (m < 60) return `${m}min atrás`;
  if (h < 24) return `${h}h atrás`;
  if (d < 7)  return `${d}d atrás`;
  return fmtDate(iso);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, accent = false,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
      <div className={`mt-0.5 rounded-lg p-2 ${accent ? "bg-orange-100 dark:bg-orange-900/30" : "bg-muted"}`}>
        <Icon className={`h-4 w-4 ${accent ? "text-orange-500" : "text-muted-foreground"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CHART_COLOR = "#F97316";
const CHART_GRID  = "rgba(128,128,128,.15)";

// ── Main page ────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "7 dias",    value: 7   },
  { label: "30 dias",   value: 30  },
  { label: "90 dias",   value: 90  },
  { label: "1 ano",     value: 365 },
];

export default function UtilizacaoPage() {
  const [days,    setDays]    = useState(30);
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/analytics/dashboard?days=${days}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao carregar"); return; }
      setData(json);
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Skeleton
  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded bg-muted animate-pulse" />
        <div className="h-9 w-64 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <p className="font-semibold text-destructive">{error}</p>
      <button onClick={load} className="mt-3 text-sm underline">Tentar novamente</button>
    </div>
  );

  if (!data) return null;

  const { overview, daily_chart, dow_chart, monthly_chart, page_ranking, users } = data;

  // Para o gráfico diário — mostrar label com formatação curta
  const dailyWithLabel = daily_chart.map((d) => ({
    ...d,
    label: d.date
      ? new Date(d.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })
      : "",
  }));

  // Marcar #1, #2, #3
  const rankedUsers = users.map((u, i) => ({ ...u, rank: i + 1 }));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-condensed font-bold text-2xl uppercase tracking-display"
            style={{ color: "var(--ink,#0A1220)" }}>
            Utilização
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {overview.total_events.toLocaleString("pt-PT")} interacções nos últimos {days} dias
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/40">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                days === p.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Users}    label="Total utilizadores" value={overview.total_users}  sub={`${overview.active_users} activos`} />
        <KpiCard icon={Activity} label="Activos hoje"       value={overview.active_today} accent />
        <KpiCard icon={Activity} label="Activos esta semana" value={overview.active_week}  accent />
        <KpiCard icon={Activity} label="Activos este mês"   value={overview.active_month} accent />
        <KpiCard icon={TrendingUp} label="Interacções"      value={overview.total_events.toLocaleString("pt-PT")} sub={`últimos ${days} dias`} />
        <KpiCard icon={TrendingUp} label="Média por dia"    value={(overview.total_events / days).toFixed(1)} sub="interacções/dia" />
      </div>

      {/* Daily chart */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-500" />
          Actividade diária
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={dailyWithLabel} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLOR} stopOpacity={0.25} />
                <stop offset="95%" stopColor={CHART_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: number) => [v, "interacções"]}
              labelFormatter={(l) => l}
            />
            <Area
              type="monotone" dataKey="count"
              stroke={CHART_COLOR} strokeWidth={2}
              fill="url(#grad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Day of week + Monthly */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Day of week */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Por dia da semana
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dow_chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number) => [v, "interacções"]}
              />
              <Bar dataKey="count" fill={CHART_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            Actividade mensal
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthly_chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number) => [v, "interacções"]}
              />
              <Bar dataKey="count" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* User ranking + Pages */}
      <div className="grid xl:grid-cols-3 gap-4">

        {/* User ranking */}
        <div className="xl:col-span-2 rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <Award className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold">Ranking de utilizadores</h2>
            <span className="ml-auto text-xs text-muted-foreground">últimos {days} dias</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Utilizador</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">Papel</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Interacções</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">Último acesso</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden lg:table-cell">Último login</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rankedUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                      {u.rank === 1 && <span title="1º lugar">🥇</span>}
                      {u.rank === 2 && <span title="2º lugar">🥈</span>}
                      {u.rank === 3 && <span title="3º lugar">🥉</span>}
                      {u.rank > 3 && u.rank}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium truncate max-w-[160px]">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{u.email}</p>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold
                        ${u.role === "admin"      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                          u.role === "treinador"  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                          u.role === "tesoureiro" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                          "bg-muted text-muted-foreground"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {u.events_period > 0 ? (
                        <span className="font-bold tabular-nums">{u.events_period}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      {timeAgo(u.last_seen)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                      {fmtDateTime(u.last_login)}
                    </td>
                  </tr>
                ))}
                {rankedUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Sem dados de actividade neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Page ranking */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <Globe className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold">Páginas mais visitadas</h2>
          </div>
          <div className="divide-y">
            {page_ranking.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
            )}
            {page_ranking.map((p, i) => {
              const maxCount = page_ranking[0]?.count ?? 1;
              const pct = Math.round((p.count / maxCount) * 100);
              return (
                <div key={p.page} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.page}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-semibold tabular-nums shrink-0">{p.count}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
