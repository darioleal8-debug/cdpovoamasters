import { describe, it, expect } from "vitest";
import { liveName } from "./player-name";

describe("liveName", () => {
  it("devolve primeiro e último nome", () => {
    expect(liveName("Rui Teste")).toBe("Rui Teste");
    expect(liveName("João Pedro Silva Costa")).toBe("João Costa");
  });
  it("aceita nomes de uma palavra e valores vazios", () => {
    expect(liveName("Rui")).toBe("Rui");
    expect(liveName("  ")).toBe("");
    expect(liveName(null)).toBe("");
    expect(liveName(undefined)).toBe("");
  });
  it("ignora espaços a mais", () => {
    expect(liveName("  Marco   Provisório ")).toBe("Marco Provisório");
  });
});
