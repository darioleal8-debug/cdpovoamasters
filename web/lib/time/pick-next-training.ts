import { getAttendanceDeadline } from "@/lib/time/attendance-window";

type TrainingLike = {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  deleted_at?: string | null;
};

/**
 * Devolve o primeiro treino (de uma lista ordenada por date+start_time asc)
 * cuja janela de check-in ainda não fechou (now <= deadline).
 * Salta linhas com deleted_at preenchido.
 */
export function pickNextTraining<T extends TrainingLike>(
  rows: T[],
  now: Date = new Date(),
): T | null {
  for (const row of rows) {
    if (row.deleted_at != null) continue;
    if (now <= getAttendanceDeadline(row)) return row;
  }
  return null;
}
