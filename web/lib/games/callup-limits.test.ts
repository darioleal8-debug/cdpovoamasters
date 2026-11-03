import { describe, it, expect } from "vitest";
import { getMaxCallups, isOfficialGame, MAX_OFFICIAL_CALLUPS } from "./callup-limits";

describe("callup limits", () => {
  it("jogos oficiais da Liga têm máximo de 12", () => {
    expect(MAX_OFFICIAL_CALLUPS).toBe(12);
    expect(getMaxCallups({ game_type: "official", competition: "Liga" })).toBe(12);
  });

  it("competição com 'INATEL' conta como oficial", () => {
    expect(isOfficialGame({ game_type: null, competition: "Liga INATEL Porto" })).toBe(true);
  });

  it("amigáveis/treino não têm limite", () => {
    expect(getMaxCallups({ game_type: "friendly", competition: null })).toBeNull();
    expect(getMaxCallups(null)).toBeNull();
  });
});
