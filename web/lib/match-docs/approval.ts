/**
 * Aprovação a partir dos dados consolidados da validação cruzada.
 * O payload segue o contrato de liga_apply_game_sheet (migrações 111 + 120).
 */
import { toApplyPayload } from "@/lib/game-sheet/engine";
import type { OfficialInput, ReconciliationResult } from "./reconcile";

export function openRelevantDiscrepancies(r: ReconciliationResult) {
  return r.discrepancies.filter((d) => d.severity === "high" && !d.resolved);
}

export function blockingMathIssues(r: ReconciliationResult) {
  return r.mathIssues.filter((i) => i.severity === "error" && (i.docId === "consolidated" || i.code === "totals_vs_score"));
}

export function toConsolidatedApplyPayload(r: ReconciliationResult, official: OfficialInput[], countedDocIds: string[]) {
  if (r.final.home === null || r.final.away === null) throw new Error("Resultado consolidado em falta");
  const bestOfficial = official.find((o) => r.usedDocs.includes(o.importId)) ?? official[0] ?? null;
  const officialPayload = bestOfficial ? toApplyPayload(bestOfficial.sheet, bestOfficial.analysis) : null;

  const sumPts = (side: "home" | "away") => {
    const ps = r.players.filter((p) => p.side === side);
    return ps.length && ps.every((p) => p.stats.pts !== null) ? ps.reduce((s, p) => s + (p.stats.pts ?? 0), 0) : null;
  };
  const unattributed = (side: "home" | "away") => {
    const s = sumPts(side);
    const f = r.final[side]!;
    if (s === null) return officialPayload?.unattributed?.[side] ?? null;
    return Math.max(0, f - s);
  };
  const sideComplete = (side: "home" | "away") => {
    const s = sumPts(side);
    return s !== null && s === r.final[side];
  };
  const completeness = sideComplete("home") && sideComplete("away") ? "complete"
    : r.players.length === 0 ? "none" : "partial";

  const players = r.players.map((p) => {
    const srcs = Object.values(p.sources);
    const fromPro = srcs.some((s) => s?.startsWith("pro:"));
    const fromOfficial = srcs.some((s) => s?.startsWith("official:"));
    return {
      side: p.side,
      numero: p.number,
      nome: p.name || `N.º ${p.number ?? "?"}`,
      pontos: p.stats.pts ?? 0,
      dois_pontos: p.stats.fg2m ?? 0,
      triplos: p.stats.fg3m ?? 0,
      lances_livres: p.stats.ftm ?? 0,
      faltas: p.stats.pf ?? 0,
      segundos: p.stats.secs,
      dois_pontos_tent: p.stats.fg2a,
      triplos_tent: p.stats.fg3a,
      lances_livres_tent: p.stats.fta,
      ressaltos_of: p.stats.oreb,
      ressaltos_def: p.stats.dreb,
      ressaltos: p.stats.reb,
      assistencias: p.stats.ast,
      roubos: p.stats.stl,
      perdas: p.stats.tov,
      desarmes: p.stats.blk,
      faltas_sofridas: p.stats.fd,
      mais_menos: p.stats.pm,
      eficiencia: p.stats.eff,
      extra: p.stats.pts === null ? { pontos_desconhecidos: true } : null,
      value_sources: p.sources,
      confidence: p.confidence,
      player_id: p.hoophubPlayerId,
      pontos_periodo: null,
      source: fromPro && fromOfficial ? "consolidated" : fromPro ? "pro_stats" : srcs.includes("admin") ? "consolidated" : "game_sheet",
    };
  });

  return {
    final: { home: r.final.home, away: r.final.away },
    overtime: r.periods.some((p) => p.period > 4 && ((p.home ?? 0) > 0 || (p.away ?? 0) > 0)),
    referees: bestOfficial?.sheet.officials.referees ?? [],
    unattributed: { home: unattributed("home"), away: unattributed("away") },
    completeness,
    periods: r.periods.filter((p) => p.home !== null && p.away !== null).map((p) => ({ periodo: p.period, home_points: p.home, away_points: p.away })),
    players,
    // A marcha do resultado só existe na folha oficial; mantém-se quando há folha
    ...(officialPayload && officialPayload.scoring_events.length ? { scoring_events: officialPayload.scoring_events } : {}),
    import_ids: countedDocIds,
    reconciliation: {
      version: r.version, status: r.status, confidence: r.confidence, publishable: r.publishable,
      open_discrepancies: openRelevantDiscrepancies(r).length,
    },
  };
}
