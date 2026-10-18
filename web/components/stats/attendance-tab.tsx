"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown, X, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useAttendanceStats,
  fetchPlayerDetail,
  type PlayerAttendanceStat,
  type PlayerDetailSession,
} from "@/hooks/use-attendance-stats";

// ── Helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct: number | null): string {
  if (pct === null) return "var(--muted-text,#5A6478)";
  if (pct >= 80)    return "var(--good,#16A34A)";
  if (pct >= 60)    return "#D97706";
  return "var(--bad,#D92D20)";
}

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct}%`;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  present:   "P",
  absent:    "F",
  justified: "J",
  late:      "A",
};

const STATUS_COLOR: Record<string, string> = {
  present:   "var(--good,#16A34A)",
  absent:    "var(--bad,#D92D20)",
  justified: "#2563EB",
  late:      "#D97706",
};

const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, loading,
}: { label: string; value: string; sub?: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="py-4 px-4">
        {loading ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-black tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortKey = "name" | "number" | "training_pct" | "games_pct" | "global_pct";
type SortDir = "asc" | "desc";

function sortPlayers(
  players: PlayerAttendanceStat[],
  key: SortKey,
  dir: SortDir
): PlayerAttendanceStat[] {
  return [...players].sort((a, b) => {
    let va: number | string | null;
    let vb: number | string | null;

    switch (key) {
      case "name":         va = a.name;              vb = b.name;              break;
      case "number":       va = a.number ?? 999;     vb = b.number ?? 999;     break;
      case "training_pct": va = a.training?.pct ?? -1; vb = b.training?.pct ?? -1; break;
      case "games_pct":    va = a.games?.pct ?? -1;  vb = b.games?.pct ?? -1;  break;
      case "global_pct":   va = a.global_pct ?? -1;  vb = b.global_pct ?? -1;  break;
    }

    if (va === vb) return 0;
    const cmp = typeof va === "string"
      ? (va as string).localeCompare(vb as string)
      : (va as number) - (vb as number);
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Player Detail Modal ───────────────────────────────────────────────────────

function PlayerDetailModal({
  player,
  seasonId,
  onClose,
}: {
  player: PlayerAttendanceStat;
  seasonId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PlayerDetailSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayerDetail(player.player_id, seasonId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [player.player_id, seasonId]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: "var(--ink,#0A1220)" }}
            >
              {initials(player.name)}
            </span>
            <div>
              <p className="font-bold leading-tight">{player.name}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {player.number != null ? `#${player.number}` : "Sem nº"}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
          </div>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem dados disponíveis.</p>
        ) : (
          <div className="space-y-5 py-2">

            {/* Treinos */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Treinos ({detail.training_sessions.length})
              </p>
              {detail.training_sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registos de treinos.</p>
              ) : (
                <div className="space-y-1">
                  {detail.training_sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ background: "var(--paper,#F6F7F9)" }}
                    >
                      <div>
                        <p className="text-[13px] font-medium">{s.title || "Treino"}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtDate(s.date)}</p>
                      </div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{
                          background: `${STATUS_COLOR[s.status] ?? "#888"}22`,
                          color:      STATUS_COLOR[s.status] ?? "#888",
                        }}
                      >
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Jogos */}
            {detail.game_sessions.length > 0 && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Jogos c/ estatísticas ({detail.game_sessions.length})
                </p>
                <div className="space-y-1">
                  {detail.game_sessions.map((g) => (
                    <div
                      key={g.game_session_id}
                      className="rounded-lg px-3 py-2"
                      style={{ background: "var(--paper,#F6F7F9)" }}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium truncate max-w-[60%]">{g.opponent}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtDate(g.date)}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                        {g.pts} pts · {g.reb} reb · {g.ast} ast · {g.stl} stl · {g.blk} blk
                        {g.minutes != null && ` · ${g.minutes} min`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Column header with sort ───────────────────────────────────────────────────

function SortTh({
  label, sortKey, current, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none"
      style={{ color: active ? "var(--action,#F97316)" : "var(--muted-text,#5A6478)" }}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-0.5">
        {label}
        {active
          ? dir === "asc"
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AttendanceTabProps {
  seasonId: string | null;
}

export function AttendanceTab({ seasonId }: AttendanceTabProps) {
  const { data, loading } = useAttendanceStats(seasonId);
  const [sortKey, setSortKey] = useState<SortKey>("global_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter]   = useState<"ambos" | "treinos" | "jogos">("ambos");
  const [selected, setSelected] = useState<PlayerAttendanceStat | null>(null);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = useMemo(
    () => sortPlayers(data?.players ?? [], sortKey, sortDir),
    [data?.players, sortKey, sortDir]
  );

  const showTraining = filter !== "jogos";
  const showGames    = filter !== "treinos";

  return (
    <div className="space-y-4">

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Média Treinos"
          value={fmtPct(data?.team_avg.training_pct ?? null)}
          loading={loading}
        />
        <SummaryCard
          label="Média Jogos"
          value={fmtPct(data?.team_avg.games_pct ?? null)}
          sub={data?.season.games_with_stats
            ? `${data.season.games_with_stats} de ${data.season.total_games} jogos c/ stats`
            : undefined}
          loading={loading}
        />
        <SummaryCard
          label="Média Global"
          value={fmtPct(data?.team_avg.global_pct ?? null)}
          loading={loading}
        />
        <SummaryCard
          label="Jogadores"
          value={loading ? "—" : String(data?.players.length ?? 0)}
          loading={loading}
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(["ambos", "treinos", "jogos"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="h-8 px-3 rounded-full text-[12px] font-semibold capitalize transition-colors"
            style={{
              background:  filter === f ? "var(--ink,#0A1220)" : "var(--paper,#F6F7F9)",
              color:       filter === f ? "#fff" : "var(--muted-text,#5A6478)",
              border:      `1px solid ${filter === f ? "transparent" : "var(--line,#E4E7EE)"}`,
              touchAction: "manipulation",
            }}
          >
            {f === "ambos" ? "Ambos" : f === "treinos" ? "Treinos" : "Jogos"}
          </button>
        ))}
      </div>

      {/* Game stats coverage note */}
      {data && data.season.total_games > 0 && data.season.games_with_stats < data.season.total_games && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "rgba(249,115,22,.08)", color: "var(--action,#F97316)" }}
        >
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Dados de jogos baseados em {data.season.games_with_stats} de {data.season.total_games} jogos com estatísticas importadas.
            Jogadores sem stats em nenhum jogo aparecem como «—».
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
        </div>
      ) : !data || data.players.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem dados de assiduidade para esta temporada.
          </CardContent>
        </Card>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--line,#E4E7EE)" }}
        >
          <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--paper,#F6F7F9)", borderBottom: "1px solid var(--line,#E4E7EE)" }}>
                <tr>
                  <SortTh label="Jogador" sortKey="name"         current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Nº"      sortKey="number"       current={sortKey} dir={sortDir} onSort={handleSort} />
                  {showTraining && (
                    <>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--muted-text,#5A6478)" }}>T. Total</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>P</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>F</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>J</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>A</th>
                      <SortTh label="% Treinos" sortKey="training_pct" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </>
                  )}
                  {showGames && (
                    <>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--muted-text,#5A6478)" }}>J. Jogos</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>P</th>
                      <SortTh label="% Jogos" sortKey="games_pct" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </>
                  )}
                  <SortTh label="% Global" sortKey="global_pct" current={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => (
                  <tr
                    key={p.player_id}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderTop:  idx > 0 ? "1px solid var(--line,#E4E7EE)" : undefined,
                      background: "transparent",
                    }}
                    onClick={() => setSelected(p)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--paper,#F6F7F9)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {/* Jogador */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: "var(--ink,#0A1220)" }}
                        >
                          {initials(p.name)}
                        </span>
                        <span className="text-[13px] font-medium whitespace-nowrap">{p.name}</span>
                      </div>
                    </td>
                    {/* Nº */}
                    <td className="px-2 py-2.5 text-[13px] tabular-nums text-muted-foreground">
                      {p.number ?? "—"}
                    </td>

                    {showTraining && (
                      <>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums">{p.training?.total ?? "—"}</td>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums" style={{ color: "var(--good,#16A34A)" }}>{p.training?.present ?? "—"}</td>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums" style={{ color: "var(--bad,#D92D20)" }}>{p.training?.absent ?? "—"}</td>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums" style={{ color: "#2563EB" }}>{p.training?.justified ?? "—"}</td>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums" style={{ color: "#D97706" }}>{p.training?.late ?? "—"}</td>
                        <td className="px-2 py-2.5">
                          <span
                            className="text-[13px] font-bold tabular-nums"
                            style={{ color: pctColor(p.training?.pct ?? null) }}
                          >
                            {p.training && p.training.total > 0
                              ? `${p.training.pct}%`
                              : "—"}
                          </span>
                        </td>
                      </>
                    )}

                    {showGames && (
                      <>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums text-muted-foreground">
                          {p.games?.total_with_stats ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-[13px] tabular-nums">
                          {p.games?.present ?? "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className="text-[13px] font-bold tabular-nums"
                            style={{ color: pctColor(p.games?.pct ?? null) }}
                          >
                            {p.games != null ? fmtPct(p.games.pct) : "—"}
                          </span>
                        </td>
                      </>
                    )}

                    {/* % Global */}
                    <td className="px-2 py-2.5">
                      <span
                        className="text-[13px] font-bold tabular-nums"
                        style={{ color: pctColor(p.global_pct) }}
                      >
                        {fmtPct(p.global_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Player detail modal */}
      {selected && seasonId && (
        <PlayerDetailModal
          player={selected}
          seasonId={seasonId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
