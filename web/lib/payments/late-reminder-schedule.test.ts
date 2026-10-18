import { describe, it, expect } from "vitest";
import { isLateReminderDay, LATE_REMINDER_DAY } from "./late-reminder-schedule";

describe("aviso mensal de quotas em atraso", () => {
  it("é ao dia 8", () => expect(LATE_REMINDER_DAY).toBe(8));

  it("dia 8 às 9h em Lisboa → envia", () => {
    expect(isLateReminderDay(new Date("2026-11-08T09:00:00Z"))).toBe(true);
  });

  it("outros dias → não envia", () => {
    expect(isLateReminderDay(new Date("2026-11-07T09:00:00Z"))).toBe(false);
    expect(isLateReminderDay(new Date("2026-11-09T09:00:00Z"))).toBe(false);
  });

  it("usa o dia de Lisboa, não o UTC (verão: 23:30 UTC do dia 7 já é dia 8 em Lisboa)", () => {
    expect(isLateReminderDay(new Date("2026-07-07T23:30:00Z"))).toBe(true);
    expect(isLateReminderDay(new Date("2026-07-08T23:30:00Z"))).toBe(false);
  });
});

describe("rota do cron", () => {
  it("aceita GET (Vercel Cron) só no dia do aviso, e mantém o POST manual", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(path.join(__dirname, "..", "..", "app/api/cron/late-payments/route.ts"), "utf8");
    expect(src).toMatch(/export async function GET/);
    expect(src).toMatch(/export async function POST/);
    expect(src).toContain("isLateReminderDay(");
    expect(src.match(/isAuthorizedCron\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
