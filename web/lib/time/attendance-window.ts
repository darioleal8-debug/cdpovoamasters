import { lisbonDateTime } from "@/lib/event-time";

export const DEFAULT_TRAINING_DURATION_MIN = 90;
export const ATTENDANCE_GRACE_MIN = 180;

type Training = {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
};

/** UTC Date when the attendance window closes. */
export function getAttendanceDeadline(training: Training): Date {
  const start = training.start_time?.slice(0, 5) ?? null;
  const end   = training.end_time?.slice(0, 5)   ?? null;

  if (end) {
    return new Date(lisbonDateTime(training.date, end).getTime() + ATTENDANCE_GRACE_MIN * 60_000);
  }
  if (start) {
    return new Date(
      lisbonDateTime(training.date, start).getTime() +
      (DEFAULT_TRAINING_DURATION_MIN + ATTENDANCE_GRACE_MIN) * 60_000,
    );
  }
  // No times defined — window closes end-of-day + grace
  return new Date(lisbonDateTime(training.date, "23:59").getTime() + ATTENDANCE_GRACE_MIN * 60_000);
}

/** True while the check-in window is open. Requires start_time. */
export function isAttendanceOpen(training: Training, now: Date = new Date()): boolean {
  const start = training.start_time?.slice(0, 5) ?? null;
  if (!start) return false;
  const openAt  = lisbonDateTime(training.date, start);
  const closeAt = getAttendanceDeadline(training);
  return now >= openAt && now <= closeAt;
}

/** Lisbon-local HH:MM when the window closes, e.g. "22:30". */
export function attendanceCloseHHMM(training: Training): string {
  return getAttendanceDeadline(training)
    .toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" })
    .slice(11, 16);
}
