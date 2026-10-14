import { describe, it, expect } from "vitest";
import { pickPaymentUpdate, parseAmountDue } from "./update-fields";

describe("pickPaymentUpdate (QUO-01, QUO-06)", () => {
  it("só deixa passar os 6 campos editáveis", () => {
    const body = {
      amount: 20, amount_due: 20, status: "paid", method: "mbway", notes: "ok", payment_date: "2026-10-01",
      user_id: "u1", season_id: "s1", player_id: "p1", receipt_sent: true, created_by: "x", id: "y", month: 3,
    };
    expect(pickPaymentUpdate(body)).toEqual({
      amount: 20, amount_due: 20, status: "paid", method: "mbway", notes: "ok", payment_date: "2026-10-01",
    });
  });
  it("mantém null explícito (limpar notas/método) e ignora campos ausentes", () => {
    expect(pickPaymentUpdate({ notes: null, method: null })).toEqual({ notes: null, method: null });
  });
});

describe("parseAmountDue (QUO-07)", () => {
  it("isenção com 0 grava 0, não 20", () => {
    expect(parseAmountDue("0")).toBe(0);
  });
  it("valor vazio ou inválido usa a quota por omissão", () => {
    expect(parseAmountDue("")).toBe(20);
    expect(parseAmountDue("abc")).toBe(20);
  });
  it("valor válido é respeitado", () => {
    expect(parseAmountDue("17.5")).toBe(17.5);
  });
});
