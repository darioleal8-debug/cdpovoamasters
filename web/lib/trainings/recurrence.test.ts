import { describe, it, expect } from "vitest";
import { generateTrainingDates } from "./recurrence";

describe("generateTrainingDates", () => {
  it("único: devolve a própria data", () => {
    expect(generateTrainingDates({ start: "2026-10-20", type: "unique" })).toEqual({ ok: true, dates: ["2026-10-20"] });
  });

  it("mensal ao dia 31: uma data por mês, no último dia quando o mês é mais curto (PRES-10)", () => {
    expect(generateTrainingDates({ start: "2027-01-31", type: "monthly", dayOfMonth: 31, end: "2027-06-30" })).toEqual({
      ok: true,
      dates: ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"],
    });
  });

  it("mensal ao dia 30 não salta fevereiro", () => {
    const r = generateTrainingDates({ start: "2027-01-30", type: "monthly", dayOfMonth: 30, end: "2027-04-30" });
    expect(r).toEqual({ ok: true, dates: ["2027-01-30", "2027-02-28", "2027-03-30", "2027-04-30"] });
  });

  it("semanal atravessa a mudança de hora sem desvio", () => {
    expect(generateTrainingDates({ start: "2026-10-19", type: "weekly", dayOfWeek: 1, end: "2026-11-09" })).toEqual({
      ok: true,
      dates: ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"],
    });
  });

  it("semanal avança até ao primeiro dia da semana pedido", () => {
    const r = generateTrainingDates({ start: "2026-10-20", type: "weekly", dayOfWeek: 4, end: "2026-10-31" });
    expect(r).toEqual({ ok: true, dates: ["2026-10-22", "2026-10-29"] });
  });

  it("dia da semana inválido devolve erro em vez de ciclo infinito (DAT-09)", () => {
    expect(generateTrainingDates({ start: "2026-10-20", type: "weekly", dayOfWeek: Number("abc"), end: "2026-12-31" }).ok).toBe(false);
    expect(generateTrainingDates({ start: "2026-10-20", type: "weekly", dayOfWeek: 7, end: "2026-12-31" }).ok).toBe(false);
  });

  it("dia do mês inválido devolve erro", () => {
    expect(generateTrainingDates({ start: "2026-10-20", type: "monthly", dayOfMonth: 0, end: "2026-12-31" }).ok).toBe(false);
    expect(generateTrainingDates({ start: "2026-10-20", type: "monthly", dayOfMonth: 32, end: "2026-12-31" }).ok).toBe(false);
  });

  it("data de início inválida devolve erro", () => {
    expect(generateTrainingDates({ start: "2026-13-45", type: "unique" }).ok).toBe(false);
    expect(generateTrainingDates({ start: "amanhã", type: "unique" }).ok).toBe(false);
  });

  it("fim antes do início devolve erro", () => {
    expect(generateTrainingDates({ start: "2026-10-20", type: "weekly", dayOfWeek: 2, end: "2026-10-01" }).ok).toBe(false);
  });

  it("recusa gerar mais do que maxOccurrences", () => {
    const r = generateTrainingDates({ start: "2026-01-05", type: "weekly", dayOfWeek: 1, end: "2030-12-31", maxOccurrences: 120 });
    expect(r.ok).toBe(false);
  });

  it("tipo de recorrência desconhecido devolve erro", () => {
    expect(generateTrainingDates({ start: "2026-10-20", type: "daily" as never }).ok).toBe(false);
  });
});
