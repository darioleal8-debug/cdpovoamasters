// Geração das datas de uma série de treinos. Aritmética em UTC sobre datas civis (YYYY-MM-DD):
// sem fusos nem mudança de hora a interferir.

export type RecurrenceType = "unique" | "weekly" | "monthly";

export interface RecurrenceInput {
  start: string;               // YYYY-MM-DD
  type: RecurrenceType;
  dayOfWeek?: number;          // 0=Dom … 6=Sáb (semanal)
  dayOfMonth?: number;         // 1–31 (mensal; meses mais curtos usam o último dia)
  end?: string | null;         // YYYY-MM-DD inclusivo; por omissão start + 12 meses
  maxOccurrences?: number;     // limite de segurança (por omissão 120)
}

export type RecurrenceResult = { ok: true; dates: string[] } | { ok: false; error: string };

const DAY_MS = 86_400_000;

function parseDate(s: string | null | undefined): number | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t : null;
}

const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function generateTrainingDates(input: RecurrenceInput): RecurrenceResult {
  const max = input.maxOccurrences ?? 120;
  const start = parseDate(input.start);
  if (start === null) return { ok: false, error: "Data de início inválida." };

  if (input.type === "unique") return { ok: true, dates: [fmt(start)] };
  if (input.type !== "weekly" && input.type !== "monthly") {
    return { ok: false, error: "Tipo de recorrência inválido." };
  }

  let end: number;
  if (input.end) {
    const e = parseDate(input.end);
    if (e === null) return { ok: false, error: "Data de fim inválida." };
    end = e;
  } else {
    const s = new Date(start);
    end = Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate());
  }
  if (end < start) return { ok: false, error: "A data de fim é anterior à data de início." };

  const dates: string[] = [];
  const push = (t: number): boolean => {
    dates.push(fmt(t));
    return dates.length <= max;
  };

  if (input.type === "weekly") {
    const dow = input.dayOfWeek;
    if (dow === undefined || !Number.isInteger(dow) || dow < 0 || dow > 6) {
      return { ok: false, error: "Dia da semana inválido (0–6)." };
    }
    let t = start + ((dow - new Date(start).getUTCDay() + 7) % 7) * DAY_MS;
    for (; t <= end; t += 7 * DAY_MS) {
      if (!push(t)) return { ok: false, error: `A série teria mais de ${max} treinos.` };
    }
  } else {
    const dom = input.dayOfMonth;
    if (dom === undefined || !Number.isInteger(dom) || dom < 1 || dom > 31) {
      return { ok: false, error: "Dia do mês inválido (1–31)." };
    }
    const s = new Date(start);
    for (let y = s.getUTCFullYear(), m = s.getUTCMonth(); ; m++) {
      if (m > 11) { m = 0; y++; }
      const t = Date.UTC(y, m, Math.min(dom, daysInMonth(y, m)));
      if (t > end) break;
      if (t >= start && !push(t)) return { ok: false, error: `A série teria mais de ${max} treinos.` };
    }
  }

  if (dates.length === 0) return { ok: false, error: "Nenhuma data gerada com os parâmetros fornecidos." };
  return { ok: true, dates };
}
