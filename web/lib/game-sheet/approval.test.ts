import { describe, it, expect } from "vitest";
import { buildApprovalPlan } from "./approval";
import { emptySheetData } from "./schema";

function confirmedSheet() {
  const s = emptySheetData({ home: "PowerTogether", away: "Matosinhos Basket" });
  s.periods = [[21, 15], [11, 11], [15, 12], [6, 17]].map(([h, a], i) => ({ period: i + 1, home: h, away: a }));
  s.final = { home: 53, away: 55 };
  return s;
}

describe("buildApprovalPlan", () => {
  it("usa os dados do boletim confirmado e recalcula", () => {
    const plan = buildApprovalPlan(
      { home_score: 53, away_score: 55, extraction_raw: { jogadores: [{ nome: "IA", equipa: "casa", pontos: 99 }] }, import_id: "i" },
      { status: "confirmed", sheet_data: confirmedSheet() },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.source).toBe("game_sheet");
    // nunca usa os totais por jogador vindos da extração
    expect(plan.payload.players).toEqual([]);
    expect(plan.payload.unattributed).toEqual({ home: 53, away: 55 });
    expect((plan.payload.periods as unknown[]).length).toBe(4);
  });

  it("recusa se o delegado está a editar (boletim já não está confirmado)", () => {
    const plan = buildApprovalPlan(
      { home_score: 53, away_score: 55, extraction_raw: null, import_id: "i" },
      { status: "needs_review", sheet_data: confirmedSheet() },
    );
    expect(plan).toMatchObject({ ok: false, status: 409 });
  });

  it("recusa boletim com erros materiais", () => {
    const s = confirmedSheet();
    s.final.home = 60;
    const plan = buildApprovalPlan({ home_score: 60, away_score: 55, extraction_raw: null, import_id: "i" }, { status: "confirmed", sheet_data: s });
    expect(plan).toMatchObject({ ok: false, status: 422 });
  });

  it("recusa se o resultado da submissão diverge do boletim", () => {
    const plan = buildApprovalPlan({ home_score: 50, away_score: 55, extraction_raw: null, import_id: "i" }, { status: "confirmed", sheet_data: confirmedSheet() });
    expect(plan).toMatchObject({ ok: false, status: 409 });
  });

  it("fluxo antigo sem boletim mantém o comportamento (não apaga estatísticas)", () => {
    const plan = buildApprovalPlan({ home_score: 70, away_score: 60, extraction_raw: null, import_id: null }, null);
    expect(plan.ok && plan.payload).toMatchObject({ final: { home: 70, away: 60 }, periods: null, players: null });
  });
});
