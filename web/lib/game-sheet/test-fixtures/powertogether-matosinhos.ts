/**
 * Caso de referência (ground truth): Liga INATEL 2026/27, jogo n.º 3, 26/10/2026,
 * PowerTogether 53–55 Matosinhos Basket. Transcrito à mão da folha original e verificado:
 * parciais 21-15 · 11-11 · 15-12 · 6-17, marcha e soma dos pontos individuais batem certo.
 *
 * Os nomes dos jogadores NÃO são guardados aqui (repositório público) — só as camisolas.
 * A fotografia da folha também não é versionada; para a avaliação ao vivo ver
 * sheet-eval.live.test.ts.
 */
import type { AiSheet } from "../schema";

type Shot = "FT" | "2PT" | "3PT";
type Row = [cumulative: number, player: number, shot: Shot, period: number];

// Equipa A — PowerTogether (casa)
const A: Row[] = [
  [1, 83, "FT", 1], [2, 83, "FT", 1], [4, 80, "2PT", 1], [6, 83, "2PT", 1], [9, 91, "3PT", 1],
  [11, 83, "2PT", 1], [13, 80, "2PT", 1], [14, 91, "FT", 1], [17, 91, "3PT", 1], [19, 80, "2PT", 1],
  [20, 91, "FT", 1], [21, 91, "FT", 1],
  [24, 83, "3PT", 2], [26, 80, "2PT", 2], [28, 80, "2PT", 2], [29, 24, "FT", 2], [30, 24, "FT", 2],
  [32, 96, "2PT", 2],
  [33, 91, "FT", 3], [34, 91, "FT", 3], [36, 83, "2PT", 3], [38, 80, "2PT", 3], [40, 83, "2PT", 3],
  [41, 91, "FT", 3], [42, 91, "FT", 3], [44, 78, "2PT", 3], [47, 96, "3PT", 3],
  [48, 80, "FT", 4], [49, 80, "FT", 4], [51, 91, "2PT", 4], [53, 80, "2PT", 4],
];

// Equipa B — Matosinhos Basket (visitante)
const B: Row[] = [
  [3, 10, "3PT", 1], [4, 5, "FT", 1], [5, 1, "FT", 1], [6, 1, "FT", 1], [8, 18, "2PT", 1],
  [9, 1, "FT", 1], [10, 1, "FT", 1], [12, 5, "2PT", 1], [14, 5, "2PT", 1], [15, 71, "FT", 1],
  [17, 71, "2PT", 2], [19, 5, "2PT", 2], [20, 10, "FT", 2], [22, 1, "2PT", 2], [23, 1, "FT", 2],
  [24, 1, "FT", 2], [25, 1, "FT", 2], [26, 1, "FT", 2],
  [29, 71, "3PT", 3], [31, 18, "2PT", 3], [33, 18, "2PT", 3], [34, 18, "FT", 3], [36, 6, "2PT", 3],
  [38, 5, "2PT", 3],
  [40, 1, "2PT", 4], [41, 1, "FT", 4], [43, 18, "2PT", 4], [46, 71, "3PT", 4], [47, 5, "FT", 4],
  [48, 5, "FT", 4], [50, 71, "2PT", 4], [51, 6, "FT", 4], [52, 6, "FT", 4], [54, 5, "2PT", 4],
  [55, 71, "FT", 4],
];

// [camisola, faltas, jogou]
const ROSTER_A: [number, number, boolean][] = [
  [24, 3, true], [53, 0, false], [78, 4, true], [80, 4, true], [82, 0, false], [83, 2, true],
  [90, 2, true], [91, 2, true], [92, 1, true], [96, 1, true], [98, 0, false],
];
const ROSTER_B: [number, number, boolean][] = [
  [1, 0, true], [2, 1, true], [5, 4, true], [6, 2, true], [9, 0, true], [10, 3, true],
  [11, 0, false], [18, 1, true], [20, 0, true], [71, 0, true], [88, 0, false], [89, 0, false],
];

export const GAME = { home: "PowerTogether", away: "Matosinhos Basket", date: "2026-10-26" };

export const PERIODS = [
  { period: 1, A: 21, B: 15 },
  { period: 2, A: 11, B: 11 },
  { period: 3, A: 15, B: 12 },
  { period: 4, A: 6, B: 17 },
];
export const FINAL = { A: 53, B: 55 };

/** Pontos esperados por camisola. */
export const EXPECTED_POINTS = {
  A: { 80: 16, 91: 15, 83: 13, 96: 5, 24: 2, 78: 2 } as Record<number, number>,
  B: { 5: 13, 1: 13, 71: 12, 18: 9, 10: 4, 6: 4 } as Record<number, number>,
};

export const EXPECTED_EVENTS = { A, B };

/** Resposta "perfeita" do modelo para esta folha (formato AiSheet). */
export function perfectAiSheet(): AiSheet {
  const events = (team: "A" | "B", rows: Row[]) =>
    rows.map(([cumulativeScore, playerNumber, shotType, period], seq) => ({
      team, seq, period, cumulativeScore, points: null, shotType, playerNumber,
      confidence: 0.95, note: null, region: null,
    }));
  const players = (team: "A" | "B", rows: [number, number, boolean][]) =>
    rows.map(([number, fouls, played]) => ({ team, number, name: `Jogador ${number}`, fouls, played, confidence: 0.9 }));
  return {
    schemaVersion: 1,
    layout: "inatel-fiba",
    game: {
      competition: "Campeonato do Distrito de Porto", phase: null, season: "2026/27", gameNumber: "3",
      date: "2026-10-26", time: "21:30", venue: "Miranda de Carvalho",
    },
    teams: { A: { name: "PowerTogether" }, B: { name: "Matosinhos Basket" } },
    players: [...players("A", ROSTER_A), ...players("B", ROSTER_B)],
    scoringEvents: [...events("A", A), ...events("B", B)],
    periodScores: PERIODS,
    finalScore: FINAL,
    teamFouls: [],
    timeouts: [],
    officials: { referees: [], scorer: null, timekeeper: null },
    confidence: 0.9,
    warnings: [],
    validation: { notes: [] },
    imageQuality: { legibility: 0.9, wholeSheetVisible: true, issues: [] },
  };
}

export interface ReadingScore {
  /** Eventos lidos com o acumulado certo / total esperado */
  cumulativeRecall: number;
  /** Desses, quantos têm a camisola certa */
  playerAccuracy: number;
  /** Desses, quantos têm o tipo de lançamento certo */
  shotAccuracy: number;
  /** Eventos lidos que não existem na folha */
  spurious: number;
  /** Diferenças por equipa/camisola entre pontos esperados e calculados */
  pointsDiff: { team: "A" | "B"; number: number; expected: number; got: number }[];
}

/** Compara uma leitura do modelo com o ground truth (para medir melhorias de prompt/modelo). */
export function scoreReading(
  ai: Pick<AiSheet, "scoringEvents">,
  pointsByNumber?: { A: Record<number, number>; B: Record<number, number> },
): ReadingScore {
  let expectedTotal = 0, cumOk = 0, playerOk = 0, shotOk = 0, spurious = 0;
  for (const team of ["A", "B"] as const) {
    const truth = new Map(EXPECTED_EVENTS[team].map((r) => [r[0], r]));
    const read = new Map(
      ai.scoringEvents.filter((e) => e.team === team && e.cumulativeScore !== null).map((e) => [e.cumulativeScore!, e]),
    );
    expectedTotal += truth.size;
    for (const [cum, [, player, shot]] of truth) {
      const e = read.get(cum);
      if (!e) continue;
      cumOk++;
      if (e.playerNumber === player) playerOk++;
      if (e.shotType === shot) shotOk++;
    }
    for (const cum of read.keys()) if (!truth.has(cum)) spurious++;
  }
  const pointsDiff: ReadingScore["pointsDiff"] = [];
  if (pointsByNumber) {
    for (const team of ["A", "B"] as const) {
      const numbers = new Set([...Object.keys(EXPECTED_POINTS[team]), ...Object.keys(pointsByNumber[team])].map(Number));
      for (const n of numbers) {
        const expected = EXPECTED_POINTS[team][n] ?? 0;
        const got = pointsByNumber[team][n] ?? 0;
        if (expected !== got) pointsDiff.push({ team, number: n, expected, got });
      }
    }
  }
  return {
    cumulativeRecall: cumOk / expectedTotal,
    playerAccuracy: cumOk ? playerOk / cumOk : 0,
    shotAccuracy: cumOk ? shotOk / cumOk : 0,
    spurious,
    pointsDiff,
  };
}
