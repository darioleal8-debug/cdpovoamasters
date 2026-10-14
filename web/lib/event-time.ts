/**
 * Converte uma data + hora "de parede" em Portugal continental (Europe/Lisbon)
 * no instante UTC correspondente. O servidor corre em UTC, por isso
 * `new Date("2026-10-09T21:30")` ficaria uma hora adiantado no horário de verão.
 */
export function lisbonDateTime(date: string, time: string | null | undefined): Date {
  const hhmm = (time ?? "00:00").slice(0, 5);
  const asUtc = new Date(`${date}T${hhmm}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return new Date(NaN);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(asUtc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const lisbonAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offsetMs = lisbonAsUtc - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}
