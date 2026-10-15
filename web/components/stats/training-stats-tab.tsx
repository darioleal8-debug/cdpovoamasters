"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, Dumbbell, Users } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingEntry {
  id:              string;
  date:            string;
  type:            string | null;
  is_past:         boolean;
  present:         number | null;
  absent:          number | null;
  justified:       number | null;
  late:            number | null;
  total_records:   number | null;
  pct:             number | null;
  rsvp_going:      number | null;
  rsvp_not_going:  number | null;
}

interface TrainingStatsSummary {
  total:       number;
  completed:   number;
  upcoming:    number;
  avg_present: number | null;
  avg_pct:     number | null;
  squad_size:  number;
}

interface TrainingStatsResponse {
  summary:   TrainingStatsSummary;
  trainings: TrainingEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(d: string) {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getDate()} ${MONTH_PT[dt.getMonth()]}`;
}

function pctColor(v: number | null): string {
  if (v === null) return "var(--muted-text,#5A6478)";
  if (v >= 80)   return "#16A34A";
  if (v >= 60)   return "#D97706";
  return "#DC2626";
}

// ─── Summary chip ─────────────────────────────────────────────────────────────

function StatChip({ label, value, icon: Icon, color }: {
  label: string; value: string; icon?: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4 px-4 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" style={{ color: color ?? "var(--action,#F97316)" }} />}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="text-2xl font-black tabular-nums" style={{ color: color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Per-training inline bar ──────────────────────────────────────────────────

function PctBar({ pct, max = 100 }: { pct: number; max?: number }) {
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line,#E4E7EE)", width: "100%" }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all"
        style={{ width: `${Math.min((pct / max) * 100, 100)}%`, background: pctColor(pct) }}
      />
    </div>
  );
}

// ─── RSVP comparison row ──────────────────────────────────────────────────────

function RsvpVsPresence({ trainings }: { trainings: TrainingEntry[] }) {
  const past = trainings.filter((t) => t.is_past && (t.total_records ?? 0) > 0);
  if (!past.length) return null;

  // Aggregate over all past trainings
  const totals = past.reduce(
    (acc, t) => {
      const going = t.rsvp_going ?? 0;
      const present = t.present ?? 0;
      const absent = t.absent ?? 0;
      const justified = t.justified ?? 0;
      // going and then absent/justified = said going but didn't come
      // We approximate: going_missed = max(0, going - present)
      const goingMissed = Math.max(0, going - present);
      return {
        total_going:   acc.total_going + going,
        total_present: acc.total_present + present,
        total_absent:  acc.total_absent + absent + justified,
        going_missed:  acc.going_missed + goingMissed,
      };
    },
    { total_going: 0, total_present: 0, total_absent: 0, going_missed: 0 }
  );

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-text,#5A6478)" }}>
        Disponibilidade vs Presença
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
        <div>
          <p className="text-xl font-black tabular-nums text-green-600">{totals.total_going}</p>
          <p className="text-[11px] text-muted-foreground">Confirmaram presença</p>
        </div>
        <div>
          <p className="text-xl font-black tabular-nums" style={{ color: pctColor(null) }}>{totals.total_present}</p>
          <p className="text-[11px] text-muted-foreground">Apareceram</p>
        </div>
        <div>
          <p className="text-xl font-black tabular-nums" style={{ color: totals.going_missed > 0 ? "#D97706" : undefined }}>{totals.going_missed}</p>
          <p className="text-[11px] text-muted-foreground">Confirmaram e faltaram</p>
        </div>
        <div>
          <p className="text-xl font-black tabular-nums text-red-600">{totals.total_absent}</p>
          <p className="text-[11px] text-muted-foreground">Faltas (+ justificadas)</p>
        </div>
      </div>
    </div>
  );
}

// ─── Per-training list ────────────────────────────────────────────────────────

function TrainingList({ trainings }: { trainings: TrainingEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const past = useMemo(
    () => [...trainings].filter((t) => t.is_past).reverse(), // most recent first
    [trainings]
  );
  if (!past.length) return (
    <p className="text-sm text-center py-6 text-muted-foreground">Nenhum treino realizado ainda.</p>
  );

  const visible = showAll ? past : past.slice(0, 10);

  return (
    <div className="space-y-2">
      {visible.map((t) => {
        const hasData = (t.total_records ?? 0) > 0;
        return (
          <div key={t.id}
            className="rounded-xl px-4 py-3"
            style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ink,#0A1220)" }}>
                  {fmt(t.date)}
                </p>
                {hasData ? (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-text,#5A6478)" }}>
                    {t.present} presentes · {t.absent} faltas
                    {(t.justified ?? 0) > 0 ? ` · ${t.justified} just.` : ""}
                    {(t.late ?? 0) > 0 ? ` · ${t.late} atrasados` : ""}
                  </p>
                ) : (
                  <p className="text-[11px] mt-0.5 text-muted-foreground">Sem registos de presença</p>
                )}
              </div>
              <div className="text-right shrink-0" style={{ minWidth: 56 }}>
                {hasData && t.pct !== null ? (
                  <p className="text-lg font-black tabular-nums" style={{ color: pctColor(t.pct) }}>
                    {t.pct}%
                  </p>
                ) : (
                  <p className="text-lg font-black text-muted-foreground">—</p>
                )}
              </div>
            </div>
            {hasData && t.pct !== null && (
              <div className="mt-2">
                <PctBar pct={t.pct} />
              </div>
            )}
          </div>
        );
      })}
      {past.length > 10 && (
        <button type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-sm font-medium w-full text-center py-1"
          style={{ color: "var(--action,#F97316)" }}>
          {showAll ? "Ver menos" : `Ver mais ${past.length - 10} treinos`}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrainingStatsTab({ seasonId }: { seasonId: string | null }) {
  const [data, setData]       = useState<TrainingStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sid: string | null) => {
    if (!sid) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/training-stats?seasonId=${sid}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(seasonId); }, [seasonId, load]);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    </div>
  );

  if (!data) return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Sem dados de treinos para esta temporada.
      </CardContent>
    </Card>
  );

  const { summary, trainings } = data;
  const noCompleted = summary.completed === 0;

  return (
    <div className="space-y-5">

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatChip label="Total" value={String(summary.total)} icon={Dumbbell} />
        <StatChip
          label="Realizados"
          value={String(summary.completed)}
          icon={CheckCircle2}
          color={summary.completed > 0 ? "#16A34A" : undefined}
        />
        <StatChip
          label="Por realizar"
          value={String(summary.upcoming)}
          icon={Clock}
          color={summary.upcoming > 0 ? "#D97706" : undefined}
        />
        <StatChip
          label="Média de presenças"
          value={noCompleted ? "—" : `${summary.avg_present ?? "—"} / ${summary.squad_size}`}
          icon={Users}
          color={summary.avg_pct !== null ? pctColor(summary.avg_pct) : undefined}
        />
      </div>

      {/* Avg pct banner */}
      {!noCompleted && summary.avg_pct !== null && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--ink,#0A1220)" }}>
            Taxa média de assiduidade
          </p>
          <p className="text-2xl font-black tabular-nums" style={{ color: pctColor(summary.avg_pct) }}>
            {summary.avg_pct}%
          </p>
        </div>
      )}

      {noCompleted ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ainda não há treinos realizados com presenças registadas.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* RSVP comparison */}
          <RsvpVsPresence trainings={trainings} />

          {/* Per-training list */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--muted-text,#5A6478)" }}>
              Por Treino (mais recentes primeiro)
            </p>
            <TrainingList trainings={trainings} />
          </div>
        </>
      )}
    </div>
  );
}
