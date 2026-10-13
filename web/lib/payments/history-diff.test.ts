import { describe, it, expect } from "vitest";
import { paymentChanged } from "./history-diff";

const before = { amount: 20, amount_due: 20, status: "paid", method: "mbway", notes: "pago em mão", payment_date: "2026-10-01" };

describe("paymentChanged (QUO-09)", () => {
  it("limpar notas/método (valor → null) conta como alteração", () => {
    expect(paymentChanged(before, { notes: null, method: null })).toBe(true);
  });
  it("campos ausentes não contam", () => {
    expect(paymentChanged(before, {})).toBe(false);
  });
  it("mesmo valor não conta (incluindo número vs string numérica do NUMERIC)", () => {
    expect(paymentChanged(before, { amount: 20, status: "paid" })).toBe(false);
    expect(paymentChanged({ ...before, amount: "20.00" as unknown as number }, { amount: 20 })).toBe(false);
  });
  it("valor diferente conta", () => {
    expect(paymentChanged(before, { amount: 10 })).toBe(true);
  });
});
