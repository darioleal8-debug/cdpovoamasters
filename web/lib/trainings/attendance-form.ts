import type { AttendanceStatus } from "@/types/database";

export interface RosterLike {
  player_id: string | null;
  active?: boolean | null;
}

export type EligiblePlayer<T extends RosterLike> = T & { player_id: string };

/** Atletas que podem ter presença registada: perfil nesta época e conta ativa. */
export function eligibleRoster<T extends RosterLike>(players: T[]): EligiblePlayer<T>[] {
  return players.filter((p): p is EligiblePlayer<T> => !!p.player_id && p.active !== false);
}

export function buildAttendanceRecords(
  roster: { player_id: string }[],
  local: Record<string, AttendanceStatus | undefined>
): { player_id: string; status: AttendanceStatus }[] {
  return roster
    .filter((p) => !!local[p.player_id])
    .map((p) => ({ player_id: p.player_id, status: local[p.player_id] as AttendanceStatus }));
}

export function hasUnsavedChanges(
  initial: Record<string, AttendanceStatus>,
  local: Record<string, AttendanceStatus>
): boolean {
  return Object.keys(local).some((id) => local[id] !== initial[id]);
}
