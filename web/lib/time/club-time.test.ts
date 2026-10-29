import { describe, it, expect } from "vitest";
import { todayInClubTz, CLUB_TZ } from "./club-time";

describe("todayInClubTz (PRES-14, CONV-13)", () => {
  it("fuso do clube é Europe/Lisbon", () => expect(CLUB_TZ).toBe("Europe/Lisbon"));
  it("verão: 23:30 UTC já é o dia seguinte em Lisboa", () => {
    expect(todayInClubTz(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
  });
  it("inverno: 23:30 UTC ainda é o mesmo dia em Lisboa", () => {
    expect(todayInClubTz(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
  });
  it("dia da mudança de hora (outubro)", () => {
    expect(todayInClubTz(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
  });
});

import { clubDateTimeToInstant, isGameLiveNow } from "./club-time";

describe("janela 'em direto' dos jogos", () => {
  it("inverno: 21:00 em Lisboa = 21:00 UTC", () => {
    expect(clubDateTimeToInstant("2026-11-05", "21:00:00")?.toISOString()).toBe("2026-11-05T21:00:00.000Z");
  });
  it("verão: 21:00 em Lisboa = 20:00 UTC", () => {
    expect(clubDateTimeToInstant("2026-07-05", "21:00")?.toISOString()).toBe("2026-07-05T20:00:00.000Z");
  });
  it("antes da hora de início não está em direto", () => {
    expect(isGameLiveNow("2026-11-05", "21:00", new Date("2026-11-05T20:59:00Z"))).toBe(false);
  });
  it("na hora de início e até 1h29 está em direto", () => {
    expect(isGameLiveNow("2026-11-05", "21:00", new Date("2026-11-05T21:00:00Z"))).toBe(true);
    expect(isGameLiveNow("2026-11-05", "21:00", new Date("2026-11-05T22:29:00Z"))).toBe(true);
  });
  it("1h30 após o início o sinal desaparece", () => {
    expect(isGameLiveNow("2026-11-05", "21:00", new Date("2026-11-05T22:30:00Z"))).toBe(false);
  });
  it("jogos sem hora nunca ficam em direto", () => {
    expect(isGameLiveNow("2026-11-05", null, new Date("2026-11-05T21:30:00Z"))).toBe(false);
  });
});
