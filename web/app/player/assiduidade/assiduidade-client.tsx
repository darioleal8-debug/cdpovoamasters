"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, Clock, AlertCircle, Dumbbell,
  Trophy, Flame, TrendingUp, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Season { id: string; name: string; status: string }

interface MonthlyEntry {
  month_key:        string;
  month_num:        number;
  training_total:   number;
  training_present: number;
  training_pct:     number;
}

interface ByCompEntry {
  competition:    string;
  total_finished: number;
  played:         number;
  called_up:      number;
}

interface AttendanceSummary {
  player_id: string;
  empty?:    boolean;
  training: {
    total:                  number;
    present:                number;
    absent:                 number;
    justified:              number;
    late:                   number;
    auto_present:           number;
    pct:                    number | null;
    pct_with_justified:     number | null;
    rsvp_total:             number;
    rsvp_going:             number;
    rsvp_not_going:         number;
    said_going_then_absent: number;
    streak_current:         number;
  } | null;
  games: {
    total_finished: number;
    called_up:      number;
    available:      number;
    unavailable:    number;
    no_response:    number;
    played:         number;
    total_minutes:  number;
    by_competition: ByCompEntry[];
  } | null;
  team_avg: {
    training_pct: number | null;
    games_pct:    number | null;
  };
  monthly: MonthlyEntry[];
}

interface TimelineItem {
  event_type:          "training" | "game";
  event_id:            string;
  event_date:          string;
  event_time:          string | null;
  // treino
  training_type?:      string | null;
  attendance_status?:  string | null;
  rsvp_status?:        string | null;
  // jogo
  opponent?:           string;
  competition?:        string | null;
  game_type?:          string | null;
  was_called_up?:      boolean;
  availability_status?: string | null;
  session_status?:     string | null;
  game_played?:        boolean;
  game_pts?:           number | null;
  game_reb?:           number | null;
  game_ast?:           number | null;
  game_minutes?:       number | null;
  is_past:             boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function pctColor(v: number | null): string {
  if (v === null) return "var(--muted-text,#5A6478)";
  if (v >= 80)   return "#16A34A";
  if (v >= 60)   return "#D97706";
  return "#DC2626";
}

function pctBg(v: number | null): string {
  if (v === null) return "var(--paper,#F6F7F9)";
  if (v >= 80)   return "#F0FDF4";
  if (v >= 60)   return "#FFFBEB";
  return "#FEF2F2";
}

function fmt(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function attendanceIcon(status: string | null | undefined) {
  switch (status) {
    case "present":     case "auto_present": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "late":        return <Clock       className="h-4 w-4 text-amber-500" />;
    case "justified":   return <AlertCircle className="h-4 w-4 text-blue-400" />;
    case "absent":      return <XCircle     className="h-4 w-4 text-red-500" />;
    default:            return <div className="h-4 w-4 rounded-full border-2 border-dashed border-gray-300" />;
  }
}

function attendanceLabel(status: string | null | undefined): string {
  switch (status) {
    case "present":     return "Presente";
    case "auto_present":return "Presente (auto)";
    case "late":        return "Atrasado";
    case "justified":   return "Justificado";
    case "absent":      return "Ausente";
    default:            return "Sem registo";
  }
}

// Mini bar chart (monthly evolution)
function MiniBarChart({ data }: { data: MonthlyEntry[] }) {
  if (!data.length) return <p className="text-xs text-center py-4 text-muted-foreground">Sem dados</p>;
  const max = 100;
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((m) => (
        <div key={m.month_key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="w-full rounded-t-sm relative" style={{ height: 56 }}>
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-sm transition-all"
              style={{
                height: `${Math.round(((m.training_pct ?? 0) / max) * 100)}%`,
                background: pctColor(m.training_pct),
                opacity: 0.85,
              }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">
            {MONTH_PT[(m.month_num - 1) % 12]}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, subValue, icon: Icon, teamAvg, empty,
}: {
  label:    string;
  value:    string;
  subValue?: string;
  icon:     React.ElementType;
  teamAvg?: number | null;
  empty?:   boolean;
}) {
  const numValue = parseFloat(value);
  const isNum    = !isNaN(numValue) && value.includes("%");
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
      <div className="flex items-start justify-between gap-2">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--action,#F97316)" }} />
        {teamAvg !== null && teamAvg !== undefined && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--line,#E4E7EE)", color: "var(--muted-text,#5A6478)" }}>
            Equipa: {teamAvg.toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums"
        style={{ color: isNum && !empty ? pctColor(numValue) : "var(--ink,#0A1220)" }}>
        {value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-widest mt-0.5"
        style={{ color: "var(--muted-text,#5A6478)" }}>
        {label}
      </p>
      {subValue && (
        <p className="text-[11px] mt-1" style={{ color: "var(--muted-text,#5A6478)" }}>
          {subValue}
        </p>
      )}
    </div>
  );
}

// ─── Training Tab ─────────────────────────────────────────────────────────────

function TrainingTab({ data }: { data: AttendanceSummary }) {
  const t = data.training;
  if (!t) return <p className="text-sm text-center py-8 text-muted-foreground">Sem dados de treinos.</p>;

  return (
    <div className="space-y-5">
      {/* Stats chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Total" value={String(t.total)} />
        <StatChip label="Presenças" value={String(t.present)} color="green" />
        <StatChip label="Faltas"    value={String(t.absent)}  color={t.absent > 0 ? "red" : undefined} />
        <StatChip label="Justif."   value={String(t.justified)} color="blue" />
      </div>

      {/* RSVP info */}
      {t.rsvp_total > 0 && (
        <div className="rounded-xl px-4 py-3 space-y-1.5"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--muted-text,#5A6478)" }}>
            RSVPs
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong>{t.rsvp_going}</strong> Confirmei presença</span>
            <span><strong>{t.rsvp_not_going}</strong> Disse que não ia</span>
            {t.said_going_then_absent > 0 && (
              <span className="text-amber-600">
                <strong>{t.said_going_then_absent}</strong> Confirmei mas faltei
              </span>
            )}
          </div>
        </div>
      )}

      {/* Streak */}
      <div className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: t.streak_current >= 3 ? "#FFF7ED" : "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
        <Flame className="h-5 w-5 shrink-0" style={{ color: t.streak_current >= 3 ? "#F97316" : "var(--muted-text)" }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--ink,#0A1220)" }}>
            Sequência actual: <strong>{t.streak_current}</strong> treino{t.streak_current !== 1 ? "s" : ""}
          </p>
          <p className="text-xs" style={{ color: "var(--muted-text,#5A6478)" }}>
            Presenças consecutivas nos treinos passados
          </p>
        </div>
      </div>

      {/* Monthly chart */}
      {data.monthly.length > 0 && (
        <div className="rounded-xl px-4 py-4"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--muted-text,#5A6478)" }}>
            Evolução Mensal
          </p>
          <MiniBarChart data={data.monthly} />
        </div>
      )}
    </div>
  );
}

// ─── Games Tab ────────────────────────────────────────────────────────────────

function GamesTab({ data }: { data: AttendanceSummary }) {
  const g = data.games;
  if (!g) return <p className="text-sm text-center py-8 text-muted-foreground">Sem dados de jogos.</p>;

  const playedPct = g.total_finished > 0
    ? ((g.played / g.total_finished) * 100).toFixed(0)
    : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Jogos terminados" value={String(g.total_finished)} />
        <StatChip label="Convocado"        value={String(g.called_up)} color="green" />
        <StatChip label="Jogou"            value={String(g.played)} color={g.played > 0 ? "green" : undefined} />
        <StatChip label="Minutos"          value={String(g.total_minutes)} />
      </div>

      {/* Disponibilidade */}
      <div className="rounded-xl px-4 py-3 space-y-1.5"
        style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--muted-text,#5A6478)" }}>
          Disponibilidade declarada
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-green-600"><strong>{g.available}</strong> Disponível</span>
          <span className="text-red-500"><strong>{g.unavailable}</strong> Indisponível</span>
          {g.no_response > 0 && (
            <span className="text-amber-600"><strong>{g.no_response}</strong> Sem resposta</span>
          )}
        </div>
      </div>

      {/* Por competição */}
      {g.by_competition.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--muted-text,#5A6478)" }}>
            Por competição
          </p>
          {g.by_competition.map((c) => (
            <div key={c.competition}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ink,#0A1220)" }}>{c.competition}</p>
                <p className="text-xs" style={{ color: "var(--muted-text,#5A6478)" }}>
                  {c.called_up} convocado{c.called_up !== 1 ? "s" : ""} · {c.total_finished} jogo{c.total_finished !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black tabular-nums"
                  style={{ color: pctColor(c.total_finished > 0 ? (c.played / c.total_finished) * 100 : null) }}>
                  {c.played}/{c.total_finished}
                </p>
                <p className="text-[10px]" style={{ color: "var(--muted-text,#5A6478)" }}>Jogou</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {playedPct !== null && (
        <p className="text-xs text-center" style={{ color: "var(--muted-text,#5A6478)" }}>
          Participou em {g.played} de {g.total_finished} jogos terminados ({playedPct}%)
        </p>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ timeline, loading }: { timeline: TimelineItem[]; loading: boolean }) {
  const [filter, setFilter] = useState<"all" | "training" | "game">("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = timeline.filter(
    (i) => i.is_past && (filter === "all" || i.event_type === filter)
  );
  const visible = showAll ? filtered : filtered.slice(0, 20);

  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-2">
        {(["all", "training", "game"] as const).map((f) => (
          <button key={f} type="button"
            onClick={() => { setFilter(f); setShowAll(false); }}
            className="h-8 px-4 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: filter === f ? "var(--ink,#0A1220)" : "var(--paper,#F6F7F9)",
              color:      filter === f ? "#fff" : "var(--muted-text,#5A6478)",
              border:     `1px solid ${filter === f ? "transparent" : "var(--line,#E4E7EE)"}`,
            }}>
            {f === "all" ? "Todos" : f === "training" ? "Treinos" : "Jogos"}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-center py-8 text-muted-foreground">Sem registos.</p>
      )}

      <div className="space-y-2">
        {visible.map((item) => (
          <div key={`${item.event_type}-${item.event_id}`}
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
            <div className="shrink-0">
              {item.event_type === "training"
                ? attendanceIcon(item.attendance_status)
                : item.game_played
                  ? <Trophy className="h-4 w-4 text-amber-500" />
                  : item.was_called_up
                    ? <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    : <div className="h-4 w-4 rounded-full border-2 border-dashed border-gray-300" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--ink,#0A1220)" }}>
                {item.event_type === "training"
                  ? `Treino`
                  : `vs ${item.opponent}`}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--muted-text,#5A6478)" }}>
                {item.event_type === "training"
                  ? attendanceLabel(item.attendance_status)
                  : item.game_played
                    ? `Jogou · ${item.game_pts ?? 0}pts ${item.game_reb ?? 0}reb ${item.game_ast ?? 0}ast · ${item.game_minutes ?? 0}min`
                    : item.was_called_up
                      ? "Convocado · Não jogou"
                      : "Não convocado"
                }
              </p>
            </div>
            <p className="text-xs shrink-0" style={{ color: "var(--muted-text,#5A6478)" }}>
              {fmt(item.event_date)}
            </p>
          </div>
        ))}
      </div>

      {filtered.length > 20 && !showAll && (
        <button type="button"
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1.5 mx-auto text-sm font-medium"
          style={{ color: "var(--action,#F97316)" }}>
          <ChevronDown className="h-4 w-4" />
          Ver mais {filtered.length - 20} registos
        </button>
      )}
      {showAll && filtered.length > 20 && (
        <button type="button"
          onClick={() => setShowAll(false)}
          className="flex items-center gap-1.5 mx-auto text-sm font-medium"
          style={{ color: "var(--action,#F97316)" }}>
          <ChevronUp className="h-4 w-4" />
          Recolher
        </button>
      )}
    </div>
  );
}

// ─── Stat Chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color?: "green" | "red" | "blue" }) {
  const colorMap = { green: "#16A34A", red: "#DC2626", blue: "#2563EB" };
  return (
    <div className="rounded-xl px-3 py-3 text-center"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
      <p className="text-xl font-black tabular-nums"
        style={{ color: color ? colorMap[color] : "var(--ink,#0A1220)" }}>
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5"
        style={{ color: "var(--muted-text,#5A6478)" }}>
        {label}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AssiduidadeClient({
  activeSeasonId,
  seasons,
}: {
  activeSeasonId: string | null;
  seasons:        Season[];
}) {
  const [seasonId, setSeasonId]     = useState(activeSeasonId);
  const [summary, setSummary]       = useState<AttendanceSummary | null>(null);
  const [timeline, setTimeline]     = useState<TimelineItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tlLoading, setTlLoading]   = useState(true);
  const [tab, setTab]               = useState<"treinos" | "jogos" | "historico">("treinos");
  const [rpcError, setRpcError]     = useState<string | null>(null);

  const supabase = createClient();

  const loadSummary = useCallback(async (sid: string | null) => {
    if (!sid) { setLoading(false); return; }
    setLoading(true);
    setRpcError(null);
    try {
      const { data, error } = await supabase.rpc("get_player_attendance_summary", { p_season_id: sid });
      if (error) {
        console.error("[assiduidade] RPC error:", error.code, error.message, error.details);
        setRpcError(`${error.message} (${error.code})`);
      } else if (data) {
        setSummary(data as AttendanceSummary);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const loadTimeline = useCallback(async (sid: string | null) => {
    if (!sid) { setTlLoading(false); return; }
    setTlLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_player_attendance_timeline", { p_season_id: sid });
      if (!error && data) setTimeline(data as TimelineItem[]);
    } finally {
      setTlLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadSummary(seasonId);
    loadTimeline(seasonId);
  }, [seasonId, loadSummary, loadTimeline]);

  const t = summary?.training ?? null;
  const g = summary?.games    ?? null;

  const trainingPct     = t?.pct          ?? null;
  const trainingPctJust = t?.pct_with_justified ?? null;
  const gamesPct        = g && g.total_finished > 0
    ? Math.round((g.played / g.total_finished) * 100)
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-condensed font-bold text-2xl uppercase tracking-display"
          style={{ color: "var(--ink,#0A1220)" }}>
          Assiduidade
        </h1>
        <Select value={seasonId ?? ""} onValueChange={setSeasonId} disabled={!seasons.length}>
          <SelectTrigger className="w-36 h-9 text-sm">
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

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : rpcError ? (
        <div className="rounded-2xl px-5 py-10 text-center space-y-2"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
          <p className="text-sm font-semibold text-red-600">Erro ao carregar dados de assiduidade.</p>
          <p className="text-xs text-muted-foreground font-mono">{rpcError}</p>
        </div>
      ) : !summary || summary.empty ? (
        <div className="rounded-2xl px-5 py-10 text-center text-sm text-muted-foreground"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
          Não existe um perfil de jogador para esta temporada.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="% Treinos"
              value={trainingPct !== null ? `${trainingPct.toFixed(0)}%` : "—"}
              subValue={trainingPctJust !== null ? `c/ just.: ${trainingPctJust.toFixed(0)}%` : undefined}
              icon={Dumbbell}
              teamAvg={summary.team_avg.training_pct}
            />
            <SummaryCard
              label="% Jogos"
              value={gamesPct !== null ? `${gamesPct}%` : "—"}
              subValue={g ? `${g.played}/${g.total_finished} jogos` : undefined}
              icon={Trophy}
              teamAvg={summary.team_avg.games_pct}
            />
            <SummaryCard
              label="Sequência"
              value={String(t?.streak_current ?? 0)}
              subValue="treinos consecutivos"
              icon={Flame}
            />
            <SummaryCard
              label="Convocatórias"
              value={String(g?.called_up ?? 0)}
              subValue={g ? `de ${g.total_finished} jogos` : undefined}
              icon={TrendingUp}
            />
          </div>

          {/* Tab chips */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {(["treinos", "jogos", "historico"] as const).map((id) => (
              <button key={id} type="button"
                onClick={() => setTab(id)}
                className="shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold transition-colors"
                style={{
                  background: tab === id ? "var(--ink,#0A1220)" : "var(--paper,#F6F7F9)",
                  color:      tab === id ? "#fff" : "var(--muted-text,#5A6478)",
                  border:     `1px solid ${tab === id ? "transparent" : "var(--line,#E4E7EE)"}`,
                  touchAction: "manipulation",
                }}>
                {id === "treinos" ? "Treinos" : id === "jogos" ? "Jogos" : "Histórico"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "treinos"   && <TrainingTab data={summary} />}
          {tab === "jogos"     && <GamesTab    data={summary} />}
          {tab === "historico" && <HistoryTab  timeline={timeline} loading={tlLoading} />}
        </>
      )}
    </div>
  );
}
