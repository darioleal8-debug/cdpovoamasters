import { todayInClubTz } from "@/lib/time/club-time";

/** Dia do mês (fuso do clube) em que sai o aviso automático de quotas em atraso. */
export const LATE_REMINDER_DAY = 8;

// O Vercel Cron corre todos os dias; só no dia do aviso é que se envia (1× por mês, sem tabela de registo).
export function isLateReminderDay(now: Date = new Date()): boolean {
  return Number(todayInClubTz(now).slice(8, 10)) === LATE_REMINDER_DAY;
}
