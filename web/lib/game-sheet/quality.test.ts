import { describe, it, expect } from "vitest";
import { pickBest, scoreReading } from "./quality";
import { emptySheetData, type SheetData, type SheetEvent, type Side } from "./schema";

function sheet(opts: { readPoints?: number; confidence?: number; final?: [number | null, number | null]; periodsOk?: boolean } = {}): SheetData {
  const s = emptySheetData({ home: "A", away: "B" });
  const [fh, fa] = opts.final ?? [20, 10];
  s.final = { home: fh, away: fa };
  s.periods = [{ period: 1, home: opts.periodsOk === false ? 99 : fh, away: fa }];
  s.players = [
    { id: "h7", side: "home", number: 7, name: "Sete", hoophubPlayerId: null, fouls: 0, played: true, confidence: 0.9 },
    { id: "a4", side: "away", number: 4, name: "Quatro", hoophubPlayerId: null, fouls: 0, played: true, confidence: 0.9 },
  ];
  const ev = (side: Side, n: number, upto: number): SheetEvent[] =>
    Array.from({ length: upto / 2 }, (_, i) => ({
      id: `${side}${i}`, side, seq: i, period: 1, cumulative: (i + 1) * 2, points: 2, shotType: "2PT",
      playerNumber: n, confidence: opts.confidence ?? 0.9, note: null, region: null, userVerified: false, voided: false,
    }));
  const read = opts.readPoints ?? 30;
  const homeRead = Math.min(fh ?? 0, Math.round((read * 2) / 3 / 2) * 2);
  const awayRead = Math.min(fa ?? 0, read - homeRead);
  s.events = [...ev("home", 7, homeRead), ...ev("away", 4, awayRead - (awayRead % 2))];
  return s;
}

describe("scoreReading", () => {
  it("leitura completa, consistente e legível pontua alto", () => {
    const q = scoreReading(sheet(), { legibility: 0.9, wholeSheetVisible: true, issues: [] });
    expect(q.score).toBeGreaterThan(85);
    expect(q.errors).toBe(0);
    expect(q.summary[0]).toContain("100%");
  });

  it("menos marcha lida → pontuação menor", () => {
    const full = scoreReading(sheet(), { legibility: 0.8, wholeSheetVisible: true, issues: [] });
    const partial = scoreReading(sheet({ readPoints: 10 }), { legibility: 0.8, wholeSheetVisible: true, issues: [] });
    expect(partial.score).toBeLessThan(full.score);
  });

  it("erro de consistência (parciais ≠ final) penaliza fortemente", () => {
    const ok = scoreReading(sheet(), null);
    const bad = scoreReading(sheet({ periodsOk: false }), null);
    expect(bad.errors).toBeGreaterThan(0);
    expect(ok.score - bad.score).toBeGreaterThanOrEqual(20);
  });

  it("folha cortada no enquadramento reduz a legibilidade", () => {
    const a = scoreReading(sheet(), { legibility: 0.9, wholeSheetVisible: true, issues: [] });
    const b = scoreReading(sheet(), { legibility: 0.9, wholeSheetVisible: false, issues: ["cortada à direita"] });
    expect(b.score).toBeLessThan(a.score);
    expect(b.summary).toContain("cortada à direita");
  });

  it("sem resultado final legível nunca passa de 20", () => {
    expect(scoreReading(sheet({ final: [null, 10] }), { legibility: 1, wholeSheetVisible: true, issues: [] }).score).toBeLessThanOrEqual(20);
  });
});

describe("pickBest", () => {
  const q = (score: number, errors = 0) => ({ score, errors, warnings: 0, components: {} as never, summary: [] });
  it("escolhe a maior pontuação, ignorando não analisadas", () => {
    const best = pickBest([
      { key: "a", quality: q(60), analyzedAt: "2026-10-27T10:00:00Z" },
      { key: "b", quality: null, analyzedAt: null },
      { key: "c", quality: q(82), analyzedAt: "2026-10-26T10:00:00Z" },
    ]);
    expect(best?.key).toBe("c");
  });
  it("empate → menos erros, depois mais recente", () => {
    expect(pickBest([
      { key: "a", quality: q(70, 1), analyzedAt: "2026-10-28" },
      { key: "b", quality: q(70, 0), analyzedAt: "2026-10-01" },
    ])?.key).toBe("b");
    expect(pickBest([
      { key: "a", quality: q(70), analyzedAt: "2026-10-01" },
      { key: "b", quality: q(70), analyzedAt: "2026-10-28" },
    ])?.key).toBe("b");
  });
  it("nenhuma analisada → null", () => {
    expect(pickBest([{ key: "a", quality: null, analyzedAt: null }])).toBeNull();
  });
});
