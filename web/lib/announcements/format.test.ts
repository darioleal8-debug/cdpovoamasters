import { describe, it, expect } from "vitest";
import { excerpt, formatCivilDate, targetLabel } from "./format";

describe("formatação dos comunicados", () => {
  it("data civil não muda de dia por causa do fuso", () => {
    expect(formatCivilDate("2026-11-28")).toContain("28");
    expect(formatCivilDate("2026-11-28")).toMatch(/sáb/i);
  });
  it("etiqueta de jogo com adversário e hora", () => {
    const l = targetLabel({ kind: "game", id: "g", title: "Liga 3", opponent: "Porto", competition: "Liga", date: "2026-11-28", time: "21:00:00", ends_at: "" });
    expect(l).toMatch(/^Jogo · vs Porto · .*28.* · 21:00$/);
  });
  it("etiqueta de treino sem hora", () => {
    expect(targetLabel({ kind: "training", id: "t", date: "2026-11-24", time: null, training_type: null, ends_at: "" })).toMatch(/^Treino · .*24/);
  });
  it("excerpt achata espaços e corta com reticências", () => {
    expect(excerpt("a\n\n  b")).toBe("a b");
    const out = excerpt("x".repeat(300), 50);
    expect(out.length).toBe(50);
    expect(out.endsWith("…")).toBe(true);
  });
});
