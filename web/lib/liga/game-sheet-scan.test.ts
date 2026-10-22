import { describe, test, expect } from "vitest";
import { parseJsonSafe, validateQuarters, penalizeConfidence } from "./game-sheet-scan";

// ── parseJsonSafe ────────────────────────────────────────────────────────────

describe("parseJsonSafe", () => {
  test("parses clean JSON", () => {
    const result = parseJsonSafe('{"pontos_casa": 80, "pontos_fora": 72}');
    expect(result).toEqual({ pontos_casa: 80, pontos_fora: 72 });
  });

  test("strips ```json fences", () => {
    const raw = '```json\n{"pontos_casa": 80}\n```';
    expect(parseJsonSafe(raw)).toEqual({ pontos_casa: 80 });
  });

  test("strips ``` fences without language tag", () => {
    const raw = "```\n{\"a\": 1}\n```";
    expect(parseJsonSafe(raw)).toEqual({ a: 1 });
  });

  test("extracts JSON from text before/after", () => {
    const raw = 'Aqui está o resultado:\n{"pontos_casa": 80}\n\nEspero que ajude.';
    expect(parseJsonSafe(raw)).toEqual({ pontos_casa: 80 });
  });

  test("extracts JSON from reasoning preamble", () => {
    const raw = "Let me analyze the image...\nThe game score is:\n```json\n{\"pontos_casa\": 80, \"pontos_fora\": 72}\n```\n";
    expect(parseJsonSafe(raw)).toEqual({ pontos_casa: 80, pontos_fora: 72 });
  });

  test("throws on empty string", () => {
    expect(() => parseJsonSafe("")).toThrow(SyntaxError);
  });

  test("throws on truncated JSON", () => {
    expect(() => parseJsonSafe('{"pontos_casa": 80, "par')).toThrow();
  });

  test("throws if no JSON object found", () => {
    expect(() => parseJsonSafe("Não consegui ler a imagem.")).toThrow(SyntaxError);
  });

  test("handles nested objects", () => {
    const raw = '{"equipa_casa": "CD Póvoa", "parciais": [{"periodo": 1, "casa": 20, "fora": 18}]}';
    const result = parseJsonSafe(raw);
    expect(result.equipa_casa).toBe("CD Póvoa");
    expect((result.parciais as unknown[]).length).toBe(1);
  });
});

// ── validateQuarters ─────────────────────────────────────────────────────────

describe("validateQuarters", () => {
  test("returns empty array when sums match", () => {
    const parciais = [
      { periodo: 1, casa: 20, fora: 18 },
      { periodo: 2, casa: 22, fora: 19 },
      { periodo: 3, casa: 18, fora: 21 },
      { periodo: 4, casa: 20, fora: 14 },
    ];
    expect(validateQuarters(parciais, 80, 72)).toEqual([]);
  });

  test("warns when home sum doesn't match", () => {
    const parciais = [
      { periodo: 1, casa: 20, fora: 18 },
      { periodo: 2, casa: 22, fora: 18 },
    ];
    const warnings = validateQuarters(parciais, 45, 36); // 42 ≠ 45
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("casa");
  });

  test("warns when away sum doesn't match", () => {
    const parciais = [
      { periodo: 1, casa: 20, fora: 18 },
      { periodo: 2, casa: 22, fora: 19 },
    ];
    const warnings = validateQuarters(parciais, 42, 40); // 37 ≠ 40
    expect(warnings.some((w) => w.includes("fora"))).toBe(true);
  });

  test("both warnings when both sums wrong", () => {
    const parciais = [{ periodo: 1, casa: 10, fora: 10 }];
    expect(validateQuarters(parciais, 99, 99)).toHaveLength(2);
  });

  test("handles overtime periods correctly", () => {
    const parciais = [
      { periodo: 1, casa: 20, fora: 18 },
      { periodo: 2, casa: 18, fora: 20 },
      { periodo: 3, casa: 22, fora: 21 },
      { periodo: 4, casa: 18, fora: 19 },
      { periodo: 5, casa: 8,  fora: 6 },  // OT
    ];
    expect(validateQuarters(parciais, 86, 84)).toEqual([]);
  });

  test("returns empty array with no quarters", () => {
    expect(validateQuarters([], 80, 72)).toEqual([]);
  });
});

// ── penalizeConfidence ───────────────────────────────────────────────────────

describe("penalizeConfidence", () => {
  test("no penalty when no warnings", () => {
    expect(penalizeConfidence(0.9, [])).toBe(0.9);
  });

  test("deducts 0.2 per warning", () => {
    expect(penalizeConfidence(0.9, ["aviso 1"])).toBeCloseTo(0.7);
    expect(penalizeConfidence(0.9, ["aviso 1", "aviso 2"])).toBeCloseTo(0.5);
  });

  test("never goes below 0", () => {
    expect(penalizeConfidence(0.1, ["a", "b", "c"])).toBe(0);
  });
});
