import { describe, it, expect } from "vitest";
import { pickOperatingSeason } from "./operating-season";

describe("pickOperatingSeason", () => {
  it("mantém a época do evento quando é do próprio clube (ex.: CD Póvoa)", () => {
    expect(pickOperatingSeason({ eventSeasonId: "s1", ownSeasonIds: ["s1", "s0"], activeSeasonId: "s1" })).toBe("s1");
    // jogo de uma época antiga do próprio clube não salta para a ativa
    expect(pickOperatingSeason({ eventSeasonId: "s0", ownSeasonIds: ["s1", "s0"], activeSeasonId: "s1" })).toBe("s0");
  });
  it("jogo da Liga com época de outro clube → época ativa do clube", () => {
    expect(pickOperatingSeason({ eventSeasonId: "povoa", ownSeasonIds: new Set(["aroso"]), activeSeasonId: "aroso" })).toBe("aroso");
  });
  it("clube sem época ativa → null (nunca expõe o plantel de outro clube)", () => {
    expect(pickOperatingSeason({ eventSeasonId: "povoa", ownSeasonIds: [], activeSeasonId: null })).toBeNull();
  });
  it("sem época no evento", () => {
    expect(pickOperatingSeason({ eventSeasonId: null, ownSeasonIds: ["a"], activeSeasonId: "a" })).toBe("a");
    expect(pickOperatingSeason({ eventSeasonId: null, ownSeasonIds: [], activeSeasonId: null })).toBeNull();
  });
});
