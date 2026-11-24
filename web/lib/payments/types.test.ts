import { describe, it, expect } from "vitest";
import {
  ChargeUpsertSchema, PaymentTypeCreateSchema, PaymentTypePatchSchema, chargeSummary, normalizeCharge,
  type PlayerCharge,
} from "./types";

const uuid = "11111111-1111-4111-8111-111111111111";
const base = { season_id: uuid, payment_type_id: uuid, player_id: uuid };

describe("tipos de pagamento", () => {
  it("nome obrigatório, aparado e limitado", () => {
    expect(PaymentTypeCreateSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(PaymentTypeCreateSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(PaymentTypeCreateSchema.parse({ name: "  Equipamento " })).toEqual({ name: "Equipamento", default_amount: 0 });
  });
  it("valor não pode ser negativo", () => {
    expect(PaymentTypeCreateSchema.safeParse({ name: "A", default_amount: -1 }).success).toBe(false);
    expect(PaymentTypeCreateSchema.parse({ name: "A", default_amount: "25.5" }).default_amount).toBe(25.5);
  });
  it("atualização exige pelo menos um campo", () => {
    expect(PaymentTypePatchSchema.safeParse({}).success).toBe(false);
    expect(PaymentTypePatchSchema.safeParse({ default_amount: 5 }).success).toBe(true);
  });
});

describe("registos por jogador", () => {
  it("exige player_id ou user_id", () => {
    expect(ChargeUpsertSchema.safeParse({ season_id: uuid, payment_type_id: uuid }).success).toBe(false);
    expect(ChargeUpsertSchema.safeParse({ ...base, player_id: undefined, user_id: uuid }).success).toBe(true);
  });
  it("rejeita estado, método e data inválidos", () => {
    expect(ChargeUpsertSchema.safeParse({ ...base, status: "x" }).success).toBe(false);
    expect(ChargeUpsertSchema.safeParse({ ...base, method: "paypal" }).success).toBe(false);
    expect(ChargeUpsertSchema.safeParse({ ...base, payment_date: "24/11/2026" }).success).toBe(false);
  });
  it("isento zera valores e método", () => {
    const v = ChargeUpsertSchema.parse({ ...base, status: "exempt", amount: 30, amount_due: 30, method: "mbway" });
    expect(normalizeCharge(v)).toMatchObject({ amount: 0, amount_due: 0, method: null, status: "exempt" });
  });
  it("pago mantém os valores", () => {
    const v = ChargeUpsertSchema.parse({ ...base, amount: 40, amount_due: 40, method: "mbway", payment_date: "2026-11-24" });
    expect(normalizeCharge(v)).toMatchObject({ amount: 40, amount_due: 40, method: "mbway", payment_date: "2026-11-24" });
  });
});

describe("totais de um tipo", () => {
  const c = (player_id: string, status: PlayerCharge["status"], amount: number, amount_due: number): PlayerCharge => ({
    id: player_id, season_id: uuid, player_id, payment_type_id: uuid, status, amount, amount_due, method: null, notes: null, payment_date: null,
  });
  it("soma recebido/previsto, ignora isentos e conta por regularizar", () => {
    const s = chargeSummary([c("a", "paid", 50, 50), c("b", "partial", 20, 50), c("c", "exempt", 0, 0)], ["a", "b", "c", "d"]);
    expect(s).toEqual({ paid: 70, due: 100, missing: 30, pending: 2 }); // b (parcial) + d (sem registo)
  });
});
