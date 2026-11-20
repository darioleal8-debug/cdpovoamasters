import type { AttendanceDataPoint, Event, Training } from "@/types/database";

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Jogos reais do calendário: sem apagados nem de teste. */
export function realGames(events: Event[]): Event[] {
  return events.filter((e) => e.type === "jogo" && !e.deleted_at && !e.is_test);
}

/** Treinos que contam: os cancelados (soft delete) ficam de fora. */
export function activeTrainings(trainings: Training[]): Training[] {
  return trainings.filter((t) => !t.deleted_at);
}

/** Data local de hoje (YYYY-MM-DD) — toISOString() usa UTC e falha à volta da meia-noite. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Jogos e treinos por mês, por ordem cronológica e sem juntar o mesmo mês de anos diferentes. */
export function buildCalendarData(events: Event[], trainings: Training[]): AttendanceDataPoint[] {
  const map = new Map<string, { y: number; m: number; jogos: number; treinos: number }>();
  const bump = (isoDate: string, kind: "jogos" | "treinos") => {
    const [y, m] = isoDate.slice(0, 10).split("-").map(Number);
    if (!y || !m) return;
    const key = `${y}-${m}`;
    const e = map.get(key) ?? { y, m, jogos: 0, treinos: 0 };
    e[kind]++;
    map.set(key, e);
  };
  for (const t of activeTrainings(trainings)) bump(t.date, "treinos");
  for (const g of realGames(events)) bump(g.event_date, "jogos");

  const rows = Array.from(map.values()).sort((a, b) => a.y - b.y || a.m - b.m);
  const multiYear = new Set(rows.map((r) => r.y)).size > 1;
  return rows.map((r) => ({
    month: multiYear ? `${MONTH_ABBR[r.m - 1]}/${String(r.y).slice(2)}` : MONTH_ABBR[r.m - 1],
    jogos: r.jogos,
    treinos: r.treinos,
  }));
}
