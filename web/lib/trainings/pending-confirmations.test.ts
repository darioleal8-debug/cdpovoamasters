import { describe, it, expect } from "vitest";
import { pickPendingConfirmations, trainingEndsAt, TRAINING_CONFIRM_FROM, type ConfirmTraining } from "./pending-confirmations";

// Novembro em Lisboa = UTC+0, por isso 20:00 locais = 20:00Z.
const at = (iso: string) => new Date(iso);
const T = (over: Partial<ConfirmTraining> & { id: string; date: string }): ConfirmTraining => ({
  start_time: "19:00:00", end_time: "20:30:00", location: "Pavilhão", type: "geral", deleted_at: null, ...over,
});
const P = "p1";

describe("trainingEndsAt", () => {
  it("usa end_time quando existe", () => {
    expect(trainingEndsAt({ date: "2026-11-26", start_time: "19:00:00", end_time: "20:30:00" }).toISOString())
      .toBe("2026-11-26T20:30:00.000Z");
  });
  it("sem end_time soma 90 min ao início", () => {
    expect(trainingEndsAt({ date: "2026-11-26", start_time: "19:00:00", end_time: null }).toISOString())
      .toBe("2026-11-26T20:30:00.000Z");
  });
  it("sem horas, só termina no fim do dia", () => {
    expect(trainingEndsAt({ date: "2026-11-26", start_time: null, end_time: null }).toISOString())
      .toBe("2026-11-26T23:59:00.000Z");
  });
});

describe("pickPendingConfirmations", () => {
  const base = { attendance: [], now: at("2026-11-28T10:00:00Z") };

  it("a data de arranque é 2026-11-25", () => {
    expect(TRAINING_CONFIRM_FROM).toBe("2026-11-25");
  });

  it("treino terminado a que disse que ia e sem presença → pendente", () => {
    const r = pickPendingConfirmations({ ...base, rsvps: [{ training_id: "t1", player_id: P }], trainings: [T({ id: "t1", date: "2026-11-26" })] });
    expect(r).toEqual([expect.objectContaining({ training_id: "t1", player_id: P, date: "2026-11-26" })]);
  });

  it("não aparece antes de o treino terminar (nem durante)", () => {
    const rsvps = [{ training_id: "t1", player_id: P }];
    const trainings = [T({ id: "t1", date: "2026-11-26" })];
    expect(pickPendingConfirmations({ rsvps, trainings, attendance: [], now: at("2026-11-26T20:00:00Z") })).toHaveLength(0);
    expect(pickPendingConfirmations({ rsvps, trainings, attendance: [], now: at("2026-11-26T20:30:00Z") })).toHaveLength(1);
  });

  it("desaparece quando já há presença registada (pelo jogador ou pelo treinador)", () => {
    const r = pickPendingConfirmations({
      ...base,
      rsvps: [{ training_id: "t1", player_id: P }, { training_id: "t2", player_id: P }],
      trainings: [T({ id: "t1", date: "2026-11-26" }), T({ id: "t2", date: "2026-11-27" })],
      attendance: [{ training_id: "t1", player_id: P }],
    });
    expect(r.map((x) => x.training_id)).toEqual(["t2"]);
  });

  it("acumula: vários treinos por responder, do mais antigo para o mais recente", () => {
    const r = pickPendingConfirmations({
      ...base,
      rsvps: [{ training_id: "t3", player_id: P }, { training_id: "t1", player_id: P }, { training_id: "t2", player_id: P }],
      trainings: [T({ id: "t1", date: "2026-11-26" }), T({ id: "t2", date: "2026-11-27" }), T({ id: "t3", date: "2026-11-27", start_time: "21:00:00", end_time: "22:00:00" })],
    });
    expect(r.map((x) => x.training_id)).toEqual(["t1", "t2", "t3"]);
  });

  it("ignora treinos antes da data de arranque, apagados, ou sem treino correspondente", () => {
    const r = pickPendingConfirmations({
      ...base,
      rsvps: [{ training_id: "old", player_id: P }, { training_id: "del", player_id: P }, { training_id: "ghost", player_id: P }],
      trainings: [T({ id: "old", date: "2026-11-24" }), T({ id: "del", date: "2026-11-26", deleted_at: "2026-11-26T08:00:00Z" })],
    });
    expect(r).toHaveLength(0);
  });

  it("o mesmo treino com RSVP duplicado só gera uma notificação", () => {
    const r = pickPendingConfirmations({
      ...base,
      rsvps: [{ training_id: "t1", player_id: P }, { training_id: "t1", player_id: P }],
      trainings: [T({ id: "t1", date: "2026-11-26" })],
    });
    expect(r).toHaveLength(1);
  });

  it("a presença de outro jogador não resolve a minha", () => {
    const r = pickPendingConfirmations({
      ...base,
      rsvps: [{ training_id: "t1", player_id: P }],
      trainings: [T({ id: "t1", date: "2026-11-26" })],
      attendance: [{ training_id: "t1", player_id: "outro" }],
    });
    expect(r).toHaveLength(1);
  });
});
