import { describe, expect, it } from "vitest";
import { normalizePlayDraft } from "./normalize";

const base = {
  name: "Pick and roll",
  category: "Ataque",
  init: { pos: { "1": [250, 380], "2": [90, 280], "3": [410, 280], "4": [40, 60], "5": [210, 190] }, ball: 1 },
  steps: {
    s1: { title: "Bloqueio", text: "5 bloqueia", moves: [{ p: 5, to: [260, 330], type: "screen", s: 0, e: 0.5 }], passes: [{ f: 1, t: 5, s: 0.5, e: 1 }] },
  },
  options: [{ id: "main", label: "Principal", sub: "", steps: ["s1"] }],
};

describe("normalizePlayDraft", () => {
  it("aceita uma jogada válida", () => {
    const r = normalizePlayDraft(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });
  it("limita coordenadas ao campo e corrige tipos e categoria", () => {
    const r = normalizePlayDraft({ ...base, category: "xpto", steps: { s1: { title: "a", text: "b", moves: [{ p: 2, to: [900, -20], type: "voar", s: 0.8, e: 0.8 }] } } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const m = r.play.steps.s1.moves![0];
      expect(m.to).toEqual([500, 0]);
      expect(m.type).toBe("cut");
      expect(m.e).toBeGreaterThan(m.s);
      expect(r.play.category).toBe("Ataque");
    }
  });
  it("ignora passes inválidos e cria opção por defeito", () => {
    const r = normalizePlayDraft({ ...base, options: [], steps: { s1: { title: "a", text: "b", passes: [{ f: 1, t: 1, s: 0, e: 1 }, { f: 9, t: 2, s: 0, e: 1 }] } } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.play.steps.s1.passes).toBeUndefined();
      expect(r.play.options[0].steps).toEqual(["s1"]);
    }
  });
  it("rejeita sem nome ou sem passos", () => {
    expect(normalizePlayDraft({ ...base, name: "" }).ok).toBe(false);
    expect(normalizePlayDraft({ ...base, steps: {} }).ok).toBe(false);
    expect(normalizePlayDraft("x").ok).toBe(false);
  });
});
