/**
 * Validações matemáticas independentes da IA (funções puras, correm no servidor e no browser).
 * Só se valida o que os dados permitem: um valor `null` significa "não disponível" e nunca é
 * tratado como 0.
 */
import { STAT_KEYS, STAT_LABELS, type ProStatsData, type ProTeam, type Side, type StatKey, type StatLine } from "./pro-stats-schema";

export type MathSeverity = "error" | "warning";

export interface MathIssue {
  code: string;
  severity: MathSeverity;
  message: string;
  /** Caminho do valor em causa (ex.: "home.players.pp3.pts", "periods.sum.home") */
  path: string;
  side?: Side;
  playerId?: string;
  expected?: number | null;
  actual?: number | null;
  /** Documento onde o problema foi detetado (import id) ou "consolidated" */
  docId?: string;
}

const teamLabel = (side: Side, names?: { home: string; away: string }) => (names ? names[side] : side === "home" ? "Casa" : "Fora");

/** Validações de uma linha estatística (jogador ou totais). */
export function validateLine(line: StatLine, ctx: { path: string; who: string; side?: Side; playerId?: string; docId?: string }): MathIssue[] {
  const out: MathIssue[] = [];
  const base = { side: ctx.side, playerId: ctx.playerId, docId: ctx.docId };
  const pairs: [StatKey, StatKey, string][] = [["fg2m", "fg2a", "2 pontos"], ["fg3m", "fg3a", "3 pontos"], ["ftm", "fta", "lances livres"]];
  for (const [m, a, label] of pairs) {
    if (line[m] !== null && line[a] !== null && line[m]! > line[a]!) {
      out.push({ ...base, code: "made_gt_att", severity: "error", path: `${ctx.path}.${m}`,
        message: `${ctx.who}: ${label} convertidos (${line[m]}) superiores aos tentados (${line[a]}).`, expected: line[a], actual: line[m] });
    }
  }
  if (line.pts !== null && line.fg2m !== null && line.fg3m !== null && line.ftm !== null) {
    const calc = 2 * line.fg2m + 3 * line.fg3m + line.ftm;
    if (calc !== line.pts) {
      out.push({ ...base, code: "points_formula", severity: "error", path: `${ctx.path}.pts`,
        message: `${ctx.who}: pontos (${line.pts}) ≠ 2×${line.fg2m} + 3×${line.fg3m} + ${line.ftm} = ${calc}.`, expected: calc, actual: line.pts });
    }
  }
  if (line.reb !== null && line.oreb !== null && line.dreb !== null && line.oreb + line.dreb !== line.reb) {
    out.push({ ...base, code: "rebounds_sum", severity: "error", path: `${ctx.path}.reb`,
      message: `${ctx.who}: ressaltos totais (${line.reb}) ≠ ofensivos (${line.oreb}) + defensivos (${line.dreb}).`, expected: line.oreb + line.dreb, actual: line.reb });
  }
  return out;
}

/** Validações de uma equipa: jogadores, totais e coerência totais ↔ soma individual. */
export function validateTeam(team: ProTeam, side: Side, opts: { docId?: string; names?: { home: string; away: string }; teamScore?: number | null } = {}): MathIssue[] {
  const name = team.sheetName ?? teamLabel(side, opts.names);
  const out: MathIssue[] = [];
  for (const p of team.players) {
    out.push(...validateLine(p.stats, { path: `${side}.players.${p.id}`, who: `${p.name}${p.number !== null ? ` (#${p.number})` : ""}`, side, playerId: p.id, docId: opts.docId }));
  }
  out.push(...validateLine(team.totals, { path: `${side}.totals`, who: `Totais ${name}`, side, docId: opts.docId }));

  if (!team.teamOnly && team.players.length > 0) {
    for (const k of STAT_KEYS) {
      if (k === "pm" || k === "secs") continue; // +/- e minutos não somam ao total da equipa
      if (team.totals[k] === null || team.players.some((p) => p.stats[k] === null)) continue;
      const sum = team.players.reduce((s, p) => s + (p.stats[k] ?? 0), 0);
      if (sum !== team.totals[k]) {
        out.push({ code: "totals_vs_players", severity: k === "pts" ? "error" : "warning", path: `${side}.totals.${k}`, side, docId: opts.docId,
          message: `${name}: total de ${STAT_LABELS[k].toLowerCase()} (${team.totals[k]}) ≠ soma dos jogadores (${sum}).`, expected: sum, actual: team.totals[k] });
      }
    }
    const allPts = team.players.every((p) => p.stats.pts !== null);
    if (allPts && opts.teamScore != null) {
      const sum = team.players.reduce((s, p) => s + (p.stats.pts ?? 0), 0);
      if (sum !== opts.teamScore) {
        out.push({ code: "players_vs_score", severity: "error", path: `${side}.players.pts`, side, docId: opts.docId,
          message: `${name}: soma dos pontos individuais (${sum}) ≠ resultado da equipa (${opts.teamScore}).`, expected: opts.teamScore, actual: sum });
      }
    }
  } else if (team.totals.pts !== null && opts.teamScore != null && team.totals.pts !== opts.teamScore) {
    out.push({ code: "totals_vs_score", severity: "error", path: `${side}.totals.pts`, side, docId: opts.docId,
      message: `${name}: total de pontos (${team.totals.pts}) ≠ resultado da equipa (${opts.teamScore}).`, expected: opts.teamScore, actual: team.totals.pts });
  }
  return out;
}

/** Soma dos parciais = resultado final (por equipa), quando todos os parciais são conhecidos. */
export function validatePeriods(
  periods: { period: number; home: number | null; away: number | null }[],
  final: { home: number | null; away: number | null },
  opts: { docId?: string; names?: { home: string; away: string } } = {},
): MathIssue[] {
  const out: MathIssue[] = [];
  if (periods.length === 0) return out;
  for (const side of ["home", "away"] as const) {
    if (final[side] === null || periods.some((p) => p[side] === null)) continue;
    const sum = periods.reduce((s, p) => s + (p[side] ?? 0), 0);
    if (sum !== final[side]) {
      out.push({ code: "periods_sum", severity: "error", path: `periods.sum.${side}`, side, docId: opts.docId,
        message: `${teamLabel(side, opts.names)}: soma dos parciais (${sum}) ≠ resultado final (${final[side]}).`, expected: final[side], actual: sum });
    }
  }
  return out;
}

/** Todas as validações de um documento de estatísticas profissionais. */
export function validateProStats(data: ProStatsData, opts: { docId?: string; names?: { home: string; away: string } } = {}): MathIssue[] {
  const out: MathIssue[] = [];
  const explicitFinal = data.final;
  for (const side of ["home", "away"] as const) {
    const t = data.teams[side];
    if (t) out.push(...validateTeam(t, side, { ...opts, teamScore: explicitFinal[side] }));
  }
  out.push(...validatePeriods(data.periods, explicitFinal, opts));
  return out;
}

/** Ids de jogadores com erros (para a 2.ª leitura dirigida). */
export function playersWithErrors(issues: MathIssue[]): { side: Side; playerId: string }[] {
  const seen = new Set<string>();
  const out: { side: Side; playerId: string }[] = [];
  for (const i of issues) {
    if (i.severity !== "error" || !i.playerId || !i.side) continue;
    const k = `${i.side}:${i.playerId}`;
    if (!seen.has(k)) { seen.add(k); out.push({ side: i.side, playerId: i.playerId }); }
  }
  return out;
}
