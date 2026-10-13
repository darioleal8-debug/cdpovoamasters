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
