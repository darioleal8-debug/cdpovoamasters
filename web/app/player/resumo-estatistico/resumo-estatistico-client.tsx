"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { PlayerAverages } from "@/lib/stats/team-averages";

export type ResumoPlayerAverages = PlayerAverages & {
  name: string;
  number: number | null;
  position: string | null;
};

export type TrainingRow = {
  playerId: string;
  name: string;
  number: number | null;
  total: number;
  present: number;
  late: number;
  justified: number;
  absent: number;
  pct: number;
};

type Tab = "epoca" | "todas" | "treinos";

const f1 = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctTxt = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const shortName = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).join(" ");

type Col = {
  id: string;
  label: string;
  title: string;
  value: (p: ResumoPlayerAverages) => number | null;
  render: (p: ResumoPlayerAverages) => string;
  strong?: boolean;
  muted?: boolean;
};

const COLS: Col[] = [
  { id: "games", label: "J", title: "Jogos", value: (p) => p.games, render: (p) => String(p.games) },
  { id: "min", label: "MIN", title: "Minutos por jogo", value: (p) => p.min, render: (p) => f1(p.min) },
  { id: "pts", label: "PTS", title: "Pontos por jogo", value: (p) => p.pts, render: (p) => f1(p.pts), strong: true },
  { id: "fg2", label: "2P C/T", title: "Lançamentos de 2 pontos: convertidos/tentados por jogo", value: (p) => p.fg2m, render: (p) => `${f1(p.fg2m)}/${f1(p.fg2a)}` },
  { id: "fg2p", label: "2P%", title: "Percentagem de 2 pontos", value: (p) => p.fg2Pct, render: (p) => pctTxt(p.fg2Pct), muted: true },
  { id: "fg3", label: "3P C/T", title: "Triplos: convertidos/tentados por jogo", value: (p) => p.fg3m, render: (p) => `${f1(p.fg3m)}/${f1(p.fg3a)}` },
  { id: "fg3p", label: "3P%", title: "Percentagem de triplos", value: (p) => p.fg3Pct, render: (p) => pctTxt(p.fg3Pct), muted: true },
  { id: "ft", label: "LL C/T", title: "Lances livres: convertidos/tentados por jogo", value: (p) => p.ftm, render: (p) => `${f1(p.ftm)}/${f1(p.fta)}` },
  { id: "ftp", label: "LL%", title: "Percentagem de lances livres", value: (p) => p.ftPct, render: (p) => pctTxt(p.ftPct), muted: true },
  { id: "rebo", label: "RO", title: "Ressaltos ofensivos por jogo", value: (p) => p.rebOff, render: (p) => f1(p.rebOff) },
  { id: "rebd", label: "RD", title: "Ressaltos defensivos por jogo", value: (p) => p.rebDef, render: (p) => f1(p.rebDef) },
  { id: "reb", label: "REB", title: "Ressaltos por jogo", value: (p) => p.reb, render: (p) => f1(p.reb), strong: true },
  { id: "ast", label: "AST", title: "Assistências por jogo", value: (p) => p.ast, render: (p) => f1(p.ast), strong: true },
  { id: "stl", label: "ROU", title: "Roubos de bola por jogo", value: (p) => p.stl, render: (p) => f1(p.stl) },
  { id: "blk", label: "DES", title: "Desarmes por jogo", value: (p) => p.blk, render: (p) => f1(p.blk) },
  { id: "tov", label: "PER", title: "Perdas de bola por jogo", value: (p) => p.tov, render: (p) => f1(p.tov) },
  { id: "fouls", label: "F", title: "Faltas cometidas por jogo", value: (p) => p.fouls, render: (p) => f1(p.fouls) },
  { id: "fd", label: "FS", title: "Faltas sofridas por jogo", value: (p) => p.foulsDrawn, render: (p) => f1(p.foulsDrawn) },
  { id: "eff", label: "EFF", title: "Eficiência por jogo", value: (p) => p.eff, render: (p) => f1(p.eff), strong: true },
  { id: "pm", label: "+/-", title: "Mais/menos por jogo", value: (p) => p.plusMinus, render: (p) => (p.plusMinus == null ? "—" : `${p.plusMinus > 0 ? "+" : ""}${f1(p.plusMinus)}`) },
];

function AveragesTable({ rows, highlightKeys }: { rows: ResumoPlayerAverages[]; highlightKeys: Set<string> }) {
  const [sortId, setSortId] = useState("pts");
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.id === sortId) ?? COLS[2];
    return [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (desc ? vb - va : va - vb) || a.name.localeCompare(b.name);
    });
  }, [rows, sortId, desc]);

  function toggle(id: string) {
    if (id === sortId) setDesc((d) => !d);
    else { setSortId(id); setDesc(true); }
  }

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted">#</th>
            <th className="text-left px-2 py-2 font-semibold min-w-[110px]">Jogador</th>
            {COLS.map((c) => (
              <th key={c.id} className="px-0 py-0 text-center font-semibold" aria-sort={sortId === c.id ? (desc ? "descending" : "ascending") : "none"}>
                <button
                  type="button"
                  title={c.title}
                  onClick={() => toggle(c.id)}
                  className={`inline-flex w-full items-center justify-center gap-0.5 px-2 py-2 hover:bg-muted ${sortId === c.id ? "text-cdpovoa-primary" : ""}`}
                >
                  {c.label}
                  {sortId === c.id && (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((p) => {
            const me = highlightKeys.has(p.key);
            const bg = me ? "bg-orange-50 dark:bg-orange-950/20" : "bg-card";
            return (
              <tr key={p.key} className={me ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                <td className={`px-3 py-2 font-mono font-bold sticky left-0 ${bg}`}>{p.number ?? "–"}</td>
                <td className="px-2 py-2 font-medium">{shortName(p.name)}</td>
                {COLS.map((c) => (
                  <td
                    key={c.id}
                    className={`px-2 py-2 text-center tabular-nums ${c.strong ? "font-bold" : ""} ${c.muted ? "text-muted-foreground" : ""}`}
                  >
                    {c.render(p)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrainingTable({ rows, highlightIds }: { rows: TrainingRow[]; highlightIds: Set<string> }) {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct || b.present - a.present || a.name.localeCompare(b.name));
  const withTrainings = rows.filter((r) => r.total > 0);
  const avg = withTrainings.length
    ? Math.round((withTrainings.reduce((s, r) => s + r.pct, 0) / withTrainings.length) * 10) / 10
    : null;
  const totalSessions = rows.reduce((m, r) => Math.max(m, r.total), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Presença média da equipa</p>
          <p className="text-2xl font-black tabular-nums">{avg == null ? "—" : `${Math.round(avg)}%`}</p>
        </div>
        <div className="rounded-xl border bg-card px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Treinos registados</p>
          <p className="text-2xl font-black tabular-nums">{totalSessions}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted">#</th>
              <th className="text-left px-2 py-2 font-semibold min-w-[110px]">Jogador</th>
              <th className="px-2 py-2 text-center font-semibold" title="Treinos registados">Treinos</th>
              <th className="px-2 py-2 text-center font-semibold" title="Presenças">Pres.</th>
              <th className="px-2 py-2 text-center font-semibold" title="Atrasos">Atr.</th>
              <th className="px-2 py-2 text-center font-semibold" title="Faltas justificadas">Just.</th>
              <th className="px-2 py-2 text-center font-semibold" title="Faltas">Faltas</th>
              <th className="px-3 py-2 text-left font-semibold min-w-[130px]">Assiduidade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => {
              const me = highlightIds.has(r.playerId);
              const bg = me ? "bg-orange-50 dark:bg-orange-950/20" : "bg-card";
              const color = r.pct >= 75 ? "#16a34a" : "#F97316";
              return (
                <tr key={r.playerId} className={me ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                  <td className={`px-3 py-2 font-mono font-bold sticky left-0 ${bg}`}>{r.number ?? "–"}</td>
                  <td className="px-2 py-2 font-medium">{shortName(r.name)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.total}</td>
                  <td className="px-2 py-2 text-center tabular-nums font-bold">{r.present}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.late}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.justified}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.absent}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: color }} />
                      </div>
                      <span className="font-bold tabular-nums" style={{ color }}>{Math.round(r.pct)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card py-10 px-4 text-center text-sm text-muted-foreground">{children}</div>;
}

export function ResumoEstatisticoClient({
  currentSeasonName, seasonsCount, gamesCurrent, current, all, training, myUserId, myPlayerIds,
}: {
  currentSeasonName: string;
  seasonsCount: number;
  gamesCurrent: number;
  current: ResumoPlayerAverages[];
  all: ResumoPlayerAverages[] | null;
  training: TrainingRow[];
  myUserId: string;
  myPlayerIds: string[];
}) {
  const [tab, setTab] = useState<Tab>("epoca");
  const TABS: { id: Tab; label: string }[] = [
    { id: "epoca", label: "Época atual" },
    ...(all ? [{ id: "todas" as Tab, label: "Todas as épocas" }] : []),
    { id: "treinos", label: "Treinos" },
  ];
  const highlight = useMemo(() => new Set([myUserId, ...myPlayerIds]), [myUserId, myPlayerIds]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-condensed font-bold text-2xl uppercase tracking-display" style={{ color: "var(--ink,#0A1220)" }}>
          Resumo Estatístico
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-text,#5A6478)" }}>
          {currentSeasonName} · médias por jogo (jogos oficiais)
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold transition-colors"
            style={{
              background: tab === t.id ? "var(--ink,#0A1220)" : "var(--paper,#F6F7F9)",
              color: tab === t.id ? "#fff" : "var(--muted-text,#5A6478)",
              border: `1px solid ${tab === t.id ? "transparent" : "var(--line,#E4E7EE)"}`,
              touchAction: "manipulation",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "epoca" && (
        current.length === 0 ? (
          <Empty>Ainda não há jogos oficiais terminados com estatísticas nesta época.</Empty>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {gamesCurrent} jogo{gamesCurrent !== 1 ? "s" : ""} com estatísticas · toca num cabeçalho para ordenar
            </p>
            <AveragesTable rows={current} highlightKeys={highlight} />
          </div>
        )
      )}

      {tab === "todas" && all && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Média de {seasonsCount} épocas com jogos · toca num cabeçalho para ordenar
          </p>
          <AveragesTable rows={all} highlightKeys={highlight} />
        </div>
      )}

      {tab === "treinos" && (
        training.length === 0 ? (
          <Empty>Ainda não há treinos registados nesta época.</Empty>
        ) : (
          <TrainingTable rows={training} highlightIds={highlight} />
        )
      )}
    </div>
  );
}
