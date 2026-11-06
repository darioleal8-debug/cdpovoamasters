import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
import { excerptFromBody, slugify, validateManualNews } from "./manual-news";

describe("validateManualNews", () => {
  it("exige título e corpo", () => {
    expect(validateManualNews({ title: " ", body: "x" })).toMatchObject({ ok: false });
    expect(validateManualNews({ title: "T", body: "  " })).toMatchObject({ ok: false });
  });

  it("normaliza e gera entrada a partir do 1.º parágrafo", () => {
    const r = validateManualNews({ title: "  CD Póvoa   vence ", body: "Primeiro parágrafo.\r\n\r\nSegundo." });
    expect(r).toEqual({ ok: true, data: { title: "CD Póvoa vence", excerpt: "Primeiro parágrafo.", body: "Primeiro parágrafo.\n\nSegundo." } });
  });

  it("mantém a entrada escrita pelo admin", () => {
    const r = validateManualNews({ title: "T", excerpt: "Lide", body: "Corpo" });
    expect(r.ok && r.data.excerpt).toBe("Lide");
  });

  it("rejeita textos demasiado longos", () => {
    expect(validateManualNews({ title: "a".repeat(121), body: "x" })).toMatchObject({ ok: false });
  });
});

describe("helpers", () => {
  it("corta a entrada numa palavra", () => {
    const e = excerptFromBody("palavra ".repeat(60), 50);
    expect(e.length).toBeLessThanOrEqual(50);
    expect(e.endsWith("…")).toBe(true);
  });
  it("slugify remove acentos", () => {
    expect(slugify("A Portuguesa de Leça FC")).toBe("a-portuguesa-de-leca-fc");
  });
});
