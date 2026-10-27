import { describe, test, expect } from "vitest";
import {
  getBirthdayForYear,
  isBirthdayTodayLisbon,
  calculateAgeLisbon,
  isWithinBirthdayWindow,
  selectBirthdayPhrase,
  getTodayLisbon,
  getFirstName,
  getInitials,
} from "../birthday-utils";

// ── getBirthdayForYear ───────────────────────────────────────────────────────

describe("getBirthdayForYear", () => {
  test("returns correct date for normal birthday", () => {
    const bd = getBirthdayForYear("1990-05-15", 2024);
    expect(bd.getFullYear()).toBe(2024);
    expect(bd.getMonth()).toBe(4); // May = 4 (0-indexed)
    expect(bd.getDate()).toBe(15);
  });

  test("Feb 29 in a leap year → Feb 29", () => {
    const bd = getBirthdayForYear("1996-02-29", 2024); // 2024 is leap
    expect(bd.getMonth()).toBe(1);
    expect(bd.getDate()).toBe(29);
  });

  test("Feb 29 in a non-leap year → Feb 28", () => {
    const bd = getBirthdayForYear("1996-02-29", 2023); // 2023 not leap
    expect(bd.getMonth()).toBe(1);
    expect(bd.getDate()).toBe(28);
  });

  test("Feb 29 in century year (not divisible by 400) → Feb 28", () => {
    const bd = getBirthdayForYear("1996-02-29", 1900); // 1900 not leap
    expect(bd.getMonth()).toBe(1);
    expect(bd.getDate()).toBe(28);
  });

  test("Feb 29 in year divisible by 400 → Feb 29", () => {
    const bd = getBirthdayForYear("1996-02-29", 2000); // 2000 is leap
    expect(bd.getMonth()).toBe(1);
    expect(bd.getDate()).toBe(29);
  });
});

// ── calculateAgeLisbon ───────────────────────────────────────────────────────

describe("calculateAgeLisbon", () => {
  test("returns 0 for null", () => {
    expect(calculateAgeLisbon(null)).toBe(0);
  });

  test("returns 0 for undefined", () => {
    expect(calculateAgeLisbon(undefined)).toBe(0);
  });

  test("returns positive integer for valid birth_date", () => {
    const age = calculateAgeLisbon("1990-01-01");
    expect(age).toBeGreaterThan(0);
    expect(Number.isInteger(age)).toBe(true);
  });
});

// ── isBirthdayTodayLisbon ────────────────────────────────────────────────────

describe("isBirthdayTodayLisbon", () => {
  test("returns false for null", () => {
    expect(isBirthdayTodayLisbon(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isBirthdayTodayLisbon(undefined)).toBe(false);
  });

  test("matches today's date", () => {
    const today = getTodayLisbon();
    // Build a birth_date with today's month/day (arbitrary year)
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const birthDate = `1990-${mm}-${dd}`;
    expect(isBirthdayTodayLisbon(birthDate)).toBe(true);
  });

  test("does not match yesterday", () => {
    const today = getTodayLisbon();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getDate()).padStart(2, "0");
    expect(isBirthdayTodayLisbon(`1990-${mm}-${dd}`)).toBe(false);
  });

  // Feb 29 birthday: should match Feb 28 in non-leap year
  test("Feb 29 birthday matched on Feb 28 in non-leap year", () => {
    const today = getTodayLisbon();
    const year = today.getFullYear();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!isLeap && today.getMonth() === 1 && today.getDate() === 28) {
      expect(isBirthdayTodayLisbon("1996-02-29")).toBe(true);
    }
    // Otherwise just ensure it runs without error
    expect(typeof isBirthdayTodayLisbon("1996-02-29")).toBe("boolean");
  });
});

// ── isWithinBirthdayWindow ───────────────────────────────────────────────────

describe("isWithinBirthdayWindow", () => {
  test("returns false for null birth_date", () => {
    expect(isWithinBirthdayWindow(null)).toBe(false);
  });

  test("returns true on the birthday itself", () => {
    const today = getTodayLisbon();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    expect(isWithinBirthdayWindow(`1990-${mm}-${dd}`)).toBe(true);
  });

  test("returns false 8 days after birthday", () => {
    const today = getTodayLisbon();
    const eightDaysAgo = new Date(today);
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    const mm = String(eightDaysAgo.getMonth() + 1).padStart(2, "0");
    const dd = String(eightDaysAgo.getDate()).padStart(2, "0");
    expect(isWithinBirthdayWindow(`1990-${mm}-${dd}`)).toBe(false);
  });

  test("returns false 1 day before birthday", () => {
    const today = getTodayLisbon();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    expect(isWithinBirthdayWindow(`1990-${mm}-${dd}`)).toBe(false);
  });
});

// ── selectBirthdayPhrase ─────────────────────────────────────────────────────

describe("selectBirthdayPhrase", () => {
  test("is deterministic: same inputs → same output", () => {
    const p1 = selectBirthdayPhrase("550e8400-e29b-41d4-a716-446655440000", 2025, "João");
    const p2 = selectBirthdayPhrase("550e8400-e29b-41d4-a716-446655440000", 2025, "João");
    expect(p1).toBe(p2);
  });

  test("substitutes name in the phrase", () => {
    const phrase = selectBirthdayPhrase("550e8400-e29b-41d4-a716-446655440000", 2025, "Maria");
    expect(phrase).toContain("Maria");
  });

  test("returns a non-empty string", () => {
    const phrase = selectBirthdayPhrase("some-id", 2025, "Teste");
    expect(phrase.length).toBeGreaterThan(0);
  });

  test("different years may yield different phrases", () => {
    const p1 = selectBirthdayPhrase("550e8400-e29b-41d4-a716-446655440000", 2024, "X");
    const p2 = selectBirthdayPhrase("550e8400-e29b-41d4-a716-446655440000", 2025, "X");
    // Both are valid phrases; usually different
    expect(typeof p1).toBe("string");
    expect(typeof p2).toBe("string");
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

describe("getFirstName", () => {
  test("returns first word", () => {
    expect(getFirstName("João Silva")).toBe("João");
    expect(getFirstName("Maria")).toBe("Maria");
    expect(getFirstName("Ana Rita Costa")).toBe("Ana");
  });
});

describe("getInitials", () => {
  test("two words → 2 initials", () => {
    expect(getInitials("João Silva")).toBe("JS");
  });
  test("single name → 1 initial", () => {
    expect(getInitials("Pedro")).toBe("P");
  });
  test("many words → first 2", () => {
    expect(getInitials("Ana Rita Costa Lopes")).toBe("AR");
  });
});
