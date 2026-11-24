import { lisbonDateTime } from "@/lib/event-time";
import { LIVE_WINDOW_MS } from "@/lib/time/club-time";
import { DEFAULT_TRAINING_DURATION_MIN } from "@/lib/time/attendance-window";

/** Quanto tempo um comunicado solto fica em destaque no Dashboard. */
export const HIGHLIGHT_HOURS = 72;
const HOUR_MS = 3_600_000;

export type AnnouncementTargetKind = "game" | "training";

/** Fim de um jogo: início + 1h30 (janela "em direto" do clube); sem hora, fim do dia. */
export function gameEndsAt(date: string, time: string | null | undefined): Date {
  if (!time) return lisbonDateTime(date, "23:59");
  return new Date(lisbonDateTime(date, time).getTime() + LIVE_WINDOW_MS);
}

/** Fim de um treino: hora de fim; sem ela, início + 90 min; sem horas, fim do dia. */
export function trainingEndsAt(t: { date: string; start_time?: string | null; end_time?: string | null }): Date {
  if (t.end_time) return lisbonDateTime(t.date, t.end_time);
  if (t.start_time) return new Date(lisbonDateTime(t.date, t.start_time).getTime() + DEFAULT_TRAINING_DURATION_MIN * 60_000);
  return lisbonDateTime(t.date, "23:59");
}

export interface HighlightTarget {
  kind: AnnouncementTargetKind;
  /** Fim do jogo/treino a que o comunicado está afeto. */
  endsAt: Date;
  /** Jogo/treino apagado ou anulado: o comunicado já não faz sentido em destaque. */
  removed?: boolean;
}

/**
 * Até quando o comunicado está em destaque no Dashboard:
 *  • solto → 72 horas após a publicação;
 *  • afeto a um jogo/treino → até ao final desse jogo/treino (mesmo que passem mais de 72h).
 */
export function highlightEndsAt(createdAt: string | Date, target: HighlightTarget | null): Date {
  if (target) return target.endsAt;
  return new Date(new Date(createdAt).getTime() + HIGHLIGHT_HOURS * HOUR_MS);
}

export function isHighlighted(createdAt: string | Date, target: HighlightTarget | null, now: Date = new Date()): boolean {
  if (target?.removed) return false;
  return now.getTime() < highlightEndsAt(createdAt, target).getTime();
}
