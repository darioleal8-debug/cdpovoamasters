"use client";

import { useEffect, useState } from "react";
import { NextGameDashboard }  from "@/components/dashboard/next-game-dashboard";
import { TasksCard }          from "@/components/dashboard/tasks-card";
import { NextTrainingCard }   from "@/components/dashboard/next-training-card";
import { ClubNoticesCard }    from "@/components/dashboard/club-notices-card";
import { PlayerSeasonCard }   from "@/components/dashboard/player-season-card";

// ── Types ─────────────────────────────────────────────────────
interface DashboardData {
  season:       { id: string; name: string; year: string; status: string } | null;
  nextGame:     {
    id: string; title: string; opponent: string | null;
    event_date: string; event_time: string | null;
    location: string | null; competition: string | null;
    days_until: number; callup_count: number; roster_size: number;
  } | null;
  nextTraining: {
    id: string; event_date: string; event_time: string | null;
    location: string | null; training_kind: string | null;
    attended_count: number; roster_size: number;
    top_avatars: Array<{ id: string; name: string; photo_url: string | null }>;
  } | null;
  metrics:      { players: number; wins: number; losses: number; draws: number };
  tasks:        Array<{
    id: string; severity: "bad" | "warn" | "info";
    title: string; subtitle: string;
    href: string; action_label: string;
    deadline: string | null; count: number;
  }>;
  tasks_total:  number;
  notices:      Array<{ id: string; title: string; body: string; date: string; pinned?: boolean }>;
  playerData:   {
    games_played: number; avg_points: number | null;
    attendance_pct: number | null; payment_status: string;
  } | null;
  isPlayer:     boolean;
}

type View = "treinador" | "jogador";

// ── Season metrics strip ───────────────────────────────────────
function MetricsStrip({ metrics }: { metrics: DashboardData["metrics"] }) {
  const items = [
    { label: "Plantel",  value: metrics.players > 0 ? String(metrics.players) : "—" },
    { label: "Vitórias", value: (metrics.wins + metrics.losses) > 0 ? String(metrics.wins) : "—" },
    { label: "Derrotas", value: (metrics.wins + metrics.losses) > 0 ? String(metrics.losses) : "—" },
  ];
  return (
    <div className="flex gap-6">
      {items.map((m) => (
        <div key={m.label}>
          <p className="font-condensed font-bold text-2xl leading-none" style={{ color: "var(--ink,#0A1220)" }}>
            {m.value}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-label mt-0.5" style={{ color: "var(--muted-text,#5A6478)" }}>
            {m.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── View switcher ──────────────────────────────────────────────
function ViewSwitcher({ view, onChange, show }: { view: View; onChange: (v: View) => void; show: boolean }) {
  if (!show) return null;
  const options: Array<{ v: View; label: string }> = [
    { v: "treinador", label: "Treinador" },
    { v: "jogador",   label: "Jogador" },
  ];
  return (
    <div
      className="flex rounded-xl p-0.5 self-start"
      role="group"
      aria-label="Vista"
      style={{ background: "var(--line,#E4E7EE)" }}
    >
      {options.map(({ v, label }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className="px-4 h-8 rounded-[10px] text-[13px] font-semibold transition-all"
          style={{
            background: view === v ? "var(--ink,#0A1220)" : "transparent",
            color:      view === v ? "#fff" : "var(--muted-text,#5A6478)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-black/5" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="h-72 rounded-2xl bg-black/5" />
          <div className="h-48 rounded-2xl bg-black/5" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-black/5" />
          <div className="h-32 rounded-2xl bg-black/5" />
        </div>
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "rgba(217,45,32,.08)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="var(--bad,#D92D20)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="font-semibold" style={{ color: "var(--text,#0F1729)" }}>Erro ao carregar o painel</p>
        <p className="text-sm mt-1" style={{ color: "var(--muted-text,#5A6478)" }}>
          Verifica a tua ligação e tenta novamente.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="px-5 h-10 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: "var(--action,#F97316)", color: "#fff" }}
      >
        Tentar novamente
      </button>
    </div>
  );
}

// ── No-season state ───────────────────────────────────────────
function NoSeason() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <p className="font-condensed text-2xl font-bold uppercase tracking-display" style={{ color: "var(--muted-text,#5A6478)" }}>
        Sem temporada ativa
      </p>
      <p className="text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
        Cria ou ativa uma temporada para ver o painel.
      </p>
      <a
        href="/temporadas"
        className="px-5 h-10 inline-flex items-center rounded-xl text-sm font-semibold"
        style={{ background: "var(--ink,#0A1220)", color: "#fff" }}
      >
        Gerir temporadas
      </a>
    </div>
  );
}

// ── DashboardHeader — componente extraído para fora do OverviewClient
// (evita que React 19 detete tipos de componente diferentes entre SSR e client)
interface HeaderProps {
  seasonName: string | null | undefined;
  metrics:    DashboardData["metrics"] | null;
  showMetrics: boolean;
  view:       View;
  onViewChange: (v: View) => void;
  isPlayer:   boolean;
  // suppressHydrationWarning na data porque o servidor (UTC-4) pode ter dia
  // diferente do browser do utilizador em Portugal (UTC+1)
  dateLabel:  string;
}

function DashboardHeader({ seasonName, metrics, showMetrics, view, onViewChange, isPlayer, dateLabel }: HeaderProps) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div>
        {/* suppressHydrationWarning: data formatada pode diferir entre servidor (UTC-4) e browser (UTC+1) */}
        <p
          className="text-[12px] font-semibold capitalize"
          style={{ color: "var(--muted-text,#5A6478)" }}
          suppressHydrationWarning
        >
          {dateLabel}
        </p>
        <h1
          className="font-condensed font-bold leading-none tracking-display mt-0.5"
          style={{ fontSize: "clamp(22px,4vw,32px)", color: "var(--ink,#0A1220)" }}
        >
          {seasonName ? `Época ${seasonName}` : "Hoje"}
        </h1>
        {showMetrics && metrics && (
          <div className="hidden md:block mt-2">
            <MetricsStrip metrics={metrics} />
          </div>
        )}
      </div>
      <ViewSwitcher view={view} onChange={onViewChange} show={isPlayer} />
    </header>
  );
}

// ── TrainerView — extraído para fora do OverviewClient ─────────
interface TrainerViewProps {
  data: DashboardData;
}

function TrainerView({ data }: TrainerViewProps) {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5 order-2 md:order-1">
        <NextGameDashboard game={data.nextGame} />
        <TasksCard tasks={data.tasks} tasks_total={data.tasks_total} />
      </div>
      <div className="flex flex-col gap-4 order-1 md:order-2">
        <NextTrainingCard training={data.nextTraining} />
        {data.notices.length > 0 && <ClubNoticesCard notices={data.notices} />}
      </div>
    </div>
  );
}

// ── PlayerView — extraído para fora do OverviewClient ─────────
interface PlayerViewProps {
  data: DashboardData;
}

function PlayerView({ data }: PlayerViewProps) {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <NextGameDashboard game={data.nextGame} />
        <NextTrainingCard training={data.nextTraining} />
      </div>
      <div className="flex flex-col gap-4">
        <PlayerSeasonCard data={data.playerData} />
        {data.notices.length > 0 && <ClubNoticesCard notices={data.notices} />}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export function OverviewClient({ seasonId }: { seasonId: string | null }) {
  const [data,      setData]      = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);
  const [view,      setView]      = useState<View>("treinador");
  // dateLabel em estado para ser definido apenas no cliente (evita mismatch timezone servidor/browser)
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setDateLabel(
      new Date().toLocaleDateString("pt-PT", {
        weekday: "long", day: "numeric", month: "long",
      })
    );
  }, []);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const url = seasonId ? `/api/dashboard?season_id=${seasonId}` : "/api/dashboard";
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const json: DashboardData = await res.json();
      setData(json);
      if (json.isPlayer && json.playerData) setView("jogador");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [seasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const headerProps: HeaderProps = {
    seasonName:   data?.season?.name,
    metrics:      data?.metrics ?? null,
    showMetrics:  !!data && !loading,
    view,
    onViewChange: setView,
    isPlayer:     data?.isPlayer ?? false,
    dateLabel,
  };

  if (loading) return (
    <div className="space-y-6">
      <DashboardHeader {...headerProps} />
      <Skeleton />
    </div>
  );

  if (error) return (
    <div className="space-y-6">
      <DashboardHeader {...headerProps} />
      <ErrorState onRetry={load} />
    </div>
  );

  if (!data?.season) return (
    <div className="space-y-6">
      <DashboardHeader {...headerProps} />
      <NoSeason />
    </div>
  );

  return (
    <div className="space-y-6">
      <DashboardHeader {...headerProps} />
      {view === "jogador" && data.isPlayer ? <PlayerView data={data} /> : <TrainerView data={data} />}
    </div>
  );
}
