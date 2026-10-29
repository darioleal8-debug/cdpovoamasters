/** Fuso horário do clube. Único clube hoje; em multi-clube passa a vir de clubs.timezone. */
export const CLUB_TZ = "Europe/Lisbon";

/** Data civil (YYYY-MM-DD) de "hoje" no fuso do clube — o servidor (Vercel) corre em UTC. */
export function todayInClubTz(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** Duração da janela "em direto": desde a hora de início até 1h30 depois. */
export const LIVE_WINDOW_MS = 90 * 60 * 1000;

/**
 * Converte data (YYYY-MM-DD) + hora (HH:MM[:SS]) civis no fuso do clube
 * para um instante absoluto. Trata corretamente horário de verão/inverno.
 */
export function clubDateTimeToInstant(date: string, time: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time);
  if (!m || !t) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [h, mi, s] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s);

  // Desvio do fuso nesse instante (iterado duas vezes para acertar perto da mudança de hora)
  const offsetAt = (ms: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: CLUB_TZ, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return asUtc - ms;
  };
  let ts = naiveUtc - offsetAt(naiveUtc);
  ts = naiveUtc - offsetAt(ts);
  return new Date(ts);
}

/** O jogo está a decorrer: entre a hora de início e 1h30 depois. Sem hora → nunca. */
export function isGameLiveNow(date: string, time: string | null | undefined, now: Date = new Date()): boolean {
  if (!time) return false;
  const start = clubDateTimeToInstant(date, time);
  if (!start) return false;
  const diff = now.getTime() - start.getTime();
  return diff >= 0 && diff < LIVE_WINDOW_MS;
}
