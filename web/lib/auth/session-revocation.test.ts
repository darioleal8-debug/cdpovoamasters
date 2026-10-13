import { describe, it, expect } from "vitest";
import { banDurationFor } from "./session-revocation";

describe("banDurationFor (revisão final, Crítico 1)", () => {
  it("desativar bane no Auth: o refresh do token deixa de funcionar", () => {
    expect(banDurationFor(false)).toBe("876000h");
  });
  it("reativar levanta o ban", () => {
    expect(banDurationFor(true)).toBe("none");
  });
});
