import { describe, it, expect } from "vitest";
import { toPeriodPartials } from "./period-scores";

describe("toPeriodPartials (STA-08)", () => {
  it("converte acumulados em parciais por período", () => {
    expect(toPeriodPartials([
      { period: 1, home_score: 20, away_score: 15 },
      { period: 2, home_score: 38, away_score: 30 },
    ])).toEqual([
      { period: 1, home_score: 20, away_score: 15 },
      { period: 2, home_score: 18, away_score: 15 },
    ]);
  });
  it("ordena períodos fora de ordem", () => {
    expect(toPeriodPartials([
      { period: 2, home_score: 30, away_score: 20 },
      { period: 1, home_score: 10, away_score: 12 },
    ]).map((p) => [p.period, p.home_score, p.away_score])).toEqual([[1, 10, 12], [2, 20, 8]]);
  });
  it("lista vazia", () => {
    expect(toPeriodPartials([])).toEqual([]);
  });
});
