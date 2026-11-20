import type { PlayerAverages } from "./team-averages";
import { abbr } from "./terminology";

/** Formatadores e colunas de médias por jogo (terminologia NBA) partilhados por Resumo Estatístico e perfil do jogador. */
export const f1 = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pctTxt = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

export type StatColumn = {
  id: string;
  label: string;
  title: string;
  value: (p: PlayerAverages) => number | null;
  render: (p: PlayerAverages) => string;
  strong?: boolean;
  muted?: boolean;
};

export const COLS: StatColumn[] = [
  { id: "games", label: abbr("gp"), title: "Games played", value: (p) => p.games, render: (p) => String(p.games) },
  { id: "min", label: abbr("min"), title: "Minutes per game", value: (p) => p.min, render: (p) => f1(p.min) },
  { id: "pts", label: abbr("pts"), title: "Points per game", value: (p) => p.pts, render: (p) => f1(p.pts), strong: true },
  { id: "fg2", label: "2P M/A", title: "2-point field goals made/attempted per game", value: (p) => p.fg2m, render: (p) => `${f1(p.fg2m)}/${f1(p.fg2a)}` },
  { id: "fg2p", label: "2P%", title: "2-point field goal percentage", value: (p) => p.fg2Pct, render: (p) => pctTxt(p.fg2Pct), muted: true },
  { id: "fg3", label: "3P M/A", title: "3-point field goals made/attempted per game", value: (p) => p.fg3m, render: (p) => `${f1(p.fg3m)}/${f1(p.fg3a)}` },
  { id: "fg3p", label: "3P%", title: "3-point field goal percentage", value: (p) => p.fg3Pct, render: (p) => pctTxt(p.fg3Pct), muted: true },
  { id: "ft", label: "FT M/A", title: "Free throws made/attempted per game", value: (p) => p.ftm, render: (p) => `${f1(p.ftm)}/${f1(p.fta)}` },
  { id: "ftp", label: "FT%", title: "Free throw percentage", value: (p) => p.ftPct, render: (p) => pctTxt(p.ftPct), muted: true },
  { id: "oreb", label: abbr("oreb"), title: "Offensive rebounds per game", value: (p) => p.rebOff, render: (p) => f1(p.rebOff) },
  { id: "dreb", label: abbr("dreb"), title: "Defensive rebounds per game", value: (p) => p.rebDef, render: (p) => f1(p.rebDef) },
  { id: "reb", label: abbr("reb"), title: "Rebounds per game", value: (p) => p.reb, render: (p) => f1(p.reb), strong: true },
  { id: "ast", label: abbr("ast"), title: "Assists per game", value: (p) => p.ast, render: (p) => f1(p.ast), strong: true },
  { id: "stl", label: abbr("stl"), title: "Steals per game", value: (p) => p.stl, render: (p) => f1(p.stl) },
  { id: "blk", label: abbr("blk"), title: "Blocks per game", value: (p) => p.blk, render: (p) => f1(p.blk) },
  { id: "tov", label: abbr("tov"), title: "Turnovers per game", value: (p) => p.tov, render: (p) => f1(p.tov) },
  { id: "pf", label: abbr("pf"), title: "Personal fouls per game", value: (p) => p.fouls, render: (p) => f1(p.fouls) },
  { id: "pfd", label: abbr("pfd"), title: "Personal fouls drawn per game", value: (p) => p.foulsDrawn, render: (p) => f1(p.foulsDrawn) },
  { id: "eff", label: abbr("eff"), title: "Efficiency per game", value: (p) => p.eff, render: (p) => f1(p.eff), strong: true },
  { id: "pm", label: "+/-", title: "Plus/minus per game", value: (p) => p.plusMinus, render: (p) => (p.plusMinus == null ? "—" : `${p.plusMinus > 0 ? "+" : ""}${f1(p.plusMinus)}`) },
];
