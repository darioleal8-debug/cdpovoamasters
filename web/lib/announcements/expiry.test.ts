import { describe, it, expect } from "vitest";
import { gameEndsAt, trainingEndsAt, highlightEndsAt, isHighlighted, HIGHLIGHT_HOURS } from "./expiry";

describe("fim do jogo / treino (hora de Lisboa)", () => {
  it("jogo: início + 1h30 (inverno: 21:00 Lisboa = 21:00 UTC)", () => {
    expect(gameEndsAt("2026-11-27", "21:00:00").toISOString()).toBe("2026-11-27T22:30:00.000Z");
  });
  it("jogo no verão respeita a hora de verão", () => {
    expect(gameEndsAt("2026-07-05", "21:00").toISOString()).toBe("2026-07-05T21:30:00.000Z");
  });
  it("jogo sem hora termina no fim do dia", () => {
    expect(gameEndsAt("2026-11-27", null).toISOString()).toBe("2026-11-27T23:59:00.000Z");
  });
  it("treino usa a hora de fim", () => {
    expect(trainingEndsAt({ date: "2026-11-24", start_time: "21:00:00", end_time: "22:30:00" }).toISOString()).toBe("2026-11-24T22:30:00.000Z");
  });
  it("treino sem fim dura 90 min", () => {
    expect(trainingEndsAt({ date: "2026-11-24", start_time: "21:00:00", end_time: null }).toISOString()).toBe("2026-11-24T22:30:00.000Z");
  });
  it("treino sem horas termina no fim do dia", () => {
    expect(trainingEndsAt({ date: "2026-11-24" }).toISOString()).toBe("2026-11-24T23:59:00.000Z");
  });
});

describe("destaque no Dashboard", () => {
  const created = "2026-11-24T10:00:00.000Z";

  it("comunicado solto: 72h", () => {
    expect(HIGHLIGHT_HOURS).toBe(72);
    expect(highlightEndsAt(created, null).toISOString()).toBe("2026-11-27T10:00:00.000Z");
    expect(isHighlighted(created, null, new Date("2026-11-27T09:59:59Z"))).toBe(true);
    expect(isHighlighted(created, null, new Date("2026-11-27T10:00:00Z"))).toBe(false);
  });

  it("afeto a jogo: até ao fim do jogo, mesmo depois das 72h", () => {
    const target = { kind: "game" as const, endsAt: gameEndsAt("2026-12-05", "21:00") };
    expect(isHighlighted(created, target, new Date("2026-11-30T12:00:00Z"))).toBe(true);
    expect(isHighlighted(created, target, new Date("2026-12-05T22:29:00Z"))).toBe(true);
    expect(isHighlighted(created, target, new Date("2026-12-05T22:30:00Z"))).toBe(false);
  });

  it("afeto a treino: acaba com o treino, mesmo dentro das 72h", () => {
    const target = { kind: "training" as const, endsAt: trainingEndsAt({ date: "2026-11-24", start_time: "21:00", end_time: "22:30" }) };
    expect(isHighlighted(created, target, new Date("2026-11-24T21:30:00Z"))).toBe(true);
    expect(isHighlighted(created, target, new Date("2026-11-24T22:31:00Z"))).toBe(false);
  });

  it("jogo/treino apagado: sai do destaque", () => {
    const target = { kind: "game" as const, endsAt: gameEndsAt("2026-12-05", "21:00"), removed: true };
    expect(isHighlighted(created, target, new Date("2026-11-25T00:00:00Z"))).toBe(false);
  });
});
