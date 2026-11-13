import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service-raw", () => ({ createRawServiceClient: vi.fn() }));

import { costEur, lisbonMonth } from "./ai-usage";

describe("costEur", () => {
  it("calcula o custo estimado com cache e saída (tarifa de ponta, 0,92 €/USD)", () => {
    // 1M entrada sem cache (0,30$) + 1M saída (1,20$) = 1,50$ → 1,38 €
    expect(costEur({ promptTokens: 1_000_000, cacheHitTokens: 0, completionTokens: 1_000_000 })).toBeCloseTo(1.38, 4);
  });
  it("tokens em cache são mais baratos e nunca excedem a entrada", () => {
    const a = costEur({ promptTokens: 1_000_000, cacheHitTokens: 1_000_000, completionTokens: 0 });
    const b = costEur({ promptTokens: 1_000_000, cacheHitTokens: 5_000_000, completionTokens: 0 });
    expect(a).toBeLessThan(0.01);
    expect(b).toBeCloseTo(a, 8);
  });
  it("uma chamada típica custa uma fração do limite de 0,10 €", () => {
    expect(costEur({ promptTokens: 3000, cacheHitTokens: 0, completionTokens: 800 })).toBeLessThan(0.005);
  });
});

describe("lisbonMonth", () => {
  it("usa o mês de Lisboa na viragem de mês", () => {
    expect(lisbonMonth(new Date("2026-11-30T23:30:00Z"))).toBe("2026-11");
    expect(lisbonMonth(new Date("2026-12-01T00:30:00Z"))).toBe("2026-12");
    expect(lisbonMonth(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08"); // verão: UTC+1
  });
});
