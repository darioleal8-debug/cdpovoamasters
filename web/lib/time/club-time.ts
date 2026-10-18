/** Fuso horário do clube. Único clube hoje; em multi-clube passa a vir de clubs.timezone. */
export const CLUB_TZ = "Europe/Lisbon";

/** Data civil (YYYY-MM-DD) de "hoje" no fuso do clube — o servidor (Vercel) corre em UTC. */
export function todayInClubTz(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
