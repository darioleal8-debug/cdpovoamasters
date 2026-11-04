import { describe, it, expect } from "vitest";
import { computeSecondsPlayed, formatMinutes } from "./minutes";

describe("computeSecondsPlayed", () => {
  it("soma stints fechados e o stint aberto até ao relógio atual", () => {
    const m = computeSecondsPlayed(
      [
        { player_id: "a", period: 1, entry_clock_secs: 480, exit_clock_secs: 200 },
        { player_id: "a", period: 2, entry_clock_secs: 480, exit_clock_secs: null },
        { player_id: "b", period: 1, entry_clock_secs: 200, exit_clock_secs: 0 },
      ],
      2, 300, true
    );
    expect(m.get("a")).toBe(280 + 180);
    expect(m.get("b")).toBe(200);
  });
  it("ignora stints abertos fora do período atual ou com jogo terminado", () => {
    const st = [{ player_id: "a", period: 1, entry_clock_secs: 480, exit_clock_secs: null }];
    expect(computeSecondsPlayed(st, 2, 300, true).get("a")).toBeUndefined();
    expect(computeSecondsPlayed(st, 1, 300, false).get("a")).toBeUndefined();
  });
  it("formata m:ss", () => {
    expect(formatMinutes(754)).toBe("12:34");
    expect(formatMinutes(0)).toBe("0:00");
  });
});
