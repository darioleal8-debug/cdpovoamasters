import { describe, it, expect } from "vitest";
import { buildLiveLeagueResult, resolveOurSide } from "./live-build";

const stat = (player_id: string, pts: number, fg2 = 0, fg3 = 0, ft = 0) => ({
  player_id, pts, fg2_made: fg2, fg2_att: fg2 + 1, fg3_made: fg3, fg3_att: fg3, ft_made: ft, ft_att: ft,
  reb_off: 0, reb_def: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls_committed: 1, efficiency: 0,
});

describe("buildLiveLeagueResult", () => {
  const plays = [
    { period: 1, is_home_team: true, points_delta: 2, player_id: "a" },
    { period: 1, is_home_team: false, points_delta: 3, player_id: null },
    { period: 2, is_home_team: true, points_delta: 3, player_id: "b" },
    { period: 2, is_home_team: true, points_delta: 2, player_id: "a", deleted_at: "x" }, // anulada
    { period: 4, is_home_team: false, points_delta: 1, player_id: null },
  ];
  const names = new Map([["a", { name: "Ana", number: 4 }], ["b", { name: "Bruno", number: 7 }]]);

  it("CD Póvoa fora: inverte resultado e parciais para a orientação da liga", () => {
    const r = buildLiveLeagueResult({ ourSide: "away", ourScore: 5, oppScore: 4, plays, stats: [stat("a", 2, 1), stat("b", 3, 0, 1)], names });
    expect(r.homeScore).toBe(4);
    expect(r.awayScore).toBe(5);
    expect(r.periods).toEqual([
      { periodo: 1, home_points: 3, away_points: 2 },
      { periodo: 2, home_points: 0, away_points: 3 },
      { periodo: 3, home_points: 0, away_points: 0 },
      { periodo: 4, home_points: 1, away_points: 0 },
    ]);
    expect(r.players.map((p) => [p.side, p.nome, p.pontos, p.numero])).toEqual([["away", "Ana", 2, 4], ["away", "Bruno", 3, 7]]);
    expect(r.players[0].pontos_periodo).toEqual({ 1: 2 });
    expect(r.unattributed).toEqual({ home: 4, away: 0 });
    expect(r.overtime).toBe(false);
  });

  it("parciais inconsistentes com o resultado ficam de fora", () => {
    const r = buildLiveLeagueResult({ ourSide: "home", ourScore: 9, oppScore: 4, plays, stats: [], names });
    expect(r.periods).toBeNull();
  });

  it("resolveOurSide pelo nome da equipa", () => {
    expect(resolveOurSide({ home_team: "GD X", away_team: "CD Póvoa" }, "CD Póvoa")).toBe("away");
    expect(resolveOurSide({ home_team: "CD Póvoa", away_team: "Y" }, "CD Póvoa")).toBe("home");
  });
});
