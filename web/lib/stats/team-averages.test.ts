import { describe, it, expect } from "vitest";
import { aggregateAverages, type GameStatRow } from "./team-averages";

const row = (over: Partial<GameStatRow>): GameStatRow => ({
  key: "a", pts: 0, fg2_made: 0, fg2_att: 0, fg3_made: 0, fg3_att: 0, ft_made: 0, ft_att: 0,
  reb_off: 0, reb_def: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls_committed: 0, fouls_drawn: 0,
  efficiency: 0, seconds_played: null, plus_minus: null, ...over,
});

describe("aggregateAverages", () => {
  it("calcula médias por jogo e percentagens sobre os totais", () => {
    const [p] = aggregateAverages([
      row({ pts: 10, fg2_made: 2, fg2_att: 4, fg3_made: 2, fg3_att: 3, reb_off: 1, reb_def: 3, seconds_played: 1200, efficiency: "10" }),
      row({ pts: 5, fg2_made: 1, fg2_att: 4, ft_made: 3, ft_att: 4, reb_def: 2, seconds_played: 600, plus_minus: -4, efficiency: 4 }),
    ]);
    expect(p.games).toBe(2);
    expect(p.pts).toBe(7.5);
    expect(p.reb).toBe(3);
    expect(p.fg2Pct).toBe(37.5);
    expect(p.fg3Pct).toBe(66.7);
    expect(p.ftPct).toBe(75);
    expect(p.min).toBe(15);
    expect(p.plusMinus).toBe(-4);
    expect(p.eff).toBe(7);
  });

  it("separa jogadores e devolve null sem tentativas/minutos", () => {
    const out = aggregateAverages([row({ key: "a", pts: 2 }), row({ key: "b", pts: 4 })]);
    expect(out).toHaveLength(2);
    expect(out[0].fg2Pct).toBeNull();
    expect(out[0].min).toBeNull();
    expect(out[0].plusMinus).toBeNull();
  });
});
