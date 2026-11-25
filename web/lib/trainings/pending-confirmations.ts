import type { SupabaseClient } from "@supabase/supabase-js";
import { lisbonDateTime } from "@/lib/event-time";
import { DEFAULT_TRAINING_DURATION_MIN } from "@/lib/time/attendance-window";

/**
 * Confirmação de presença no fim do treino: quem disse que ia ("going") recebe no dashboard uma
 * notificação a perguntar se foi. Só desaparece quando há resposta (ou o treinador já registou a presença).
 *
 * Só contam treinos a partir desta data (data de arranque da funcionalidade), para ninguém receber de
 * uma só vez as notificações dos treinos antigos.
 */
export const TRAINING_CONFIRM_FROM = "2026-11-25";

export type ConfirmTraining = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  type: string | null;
  deleted_at?: string | null;
};

export type PendingConfirmation = {
  training_id: string;
  player_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  type: string | null;
};

/** Instante (UTC) em que o treino termina: end_time, senão início + duração por omissão, senão fim do dia. */
export function trainingEndsAt(t: Pick<ConfirmTraining, "date" | "start_time" | "end_time">): Date {
  if (t.end_time) return lisbonDateTime(t.date, t.end_time);
  if (t.start_time) {
    return new Date(lisbonDateTime(t.date, t.start_time).getTime() + DEFAULT_TRAINING_DURATION_MIN * 60_000);
  }
  return lisbonDateTime(t.date, "23:59");
}

/**
 * Pendentes = treinos a que o jogador disse que ia, que já terminaram, não foram apagados,
 * são da data de arranque em diante e ainda não têm presença registada (por ele ou pelo treinador).
 * Ordem: do mais antigo para o mais recente (acumulam até serem respondidos).
 */
export function pickPendingConfirmations(input: {
  rsvps: { training_id: string; player_id: string }[];
  trainings: ConfirmTraining[];
  attendance: { training_id: string; player_id: string }[];
  now: Date;
  from?: string;
}): PendingConfirmation[] {
  const from = input.from ?? TRAINING_CONFIRM_FROM;
  const byId = new Map(input.trainings.map((t) => [t.id, t]));
  const answered = new Set(input.attendance.map((a) => `${a.training_id}:${a.player_id}`));

  const out: PendingConfirmation[] = [];
  const seen = new Set<string>();
  for (const r of input.rsvps) {
    const key = `${r.training_id}:${r.player_id}`;
    if (seen.has(key) || answered.has(key)) continue;
    seen.add(key);
    const t = byId.get(r.training_id);
    if (!t || t.deleted_at || t.date < from) continue;
    if (trainingEndsAt(t).getTime() > input.now.getTime()) continue;
    out.push({
      training_id: t.id, player_id: r.player_id, date: t.date,
      start_time: t.start_time, end_time: t.end_time, location: t.location, type: t.type,
    });
  }
  return out.sort((a, b) =>
    a.date === b.date ? (a.start_time ?? "").localeCompare(b.start_time ?? "") : a.date.localeCompare(b.date));
}

/** Lê da base de dados os pendentes de um utilizador (todos os seus perfis de jogador). */
export async function loadPendingConfirmations(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<PendingConfirmation[]> {
  const { data: players } = await db.from("players").select("id").eq("user_id", userId);
  const playerIds = ((players ?? []) as { id: string }[]).map((p) => p.id);
  if (playerIds.length === 0) return [];

  const { data: rsvpRows } = await db
    .from("training_rsvps").select("training_id, player_id").in("player_id", playerIds).eq("status", "going");
  const rsvps = (rsvpRows ?? []) as { training_id: string; player_id: string }[];
  if (rsvps.length === 0) return [];

  const trainingIds = [...new Set(rsvps.map((r) => r.training_id))];
  const [{ data: trainings }, { data: attendance }] = await Promise.all([
    db.from("trainings").select("id, date, start_time, end_time, location, type, deleted_at")
      .in("id", trainingIds).gte("date", TRAINING_CONFIRM_FROM).is("deleted_at", null),
    db.from("training_attendance").select("training_id, player_id")
      .in("training_id", trainingIds).in("player_id", playerIds),
  ]);

  return pickPendingConfirmations({
    rsvps,
    trainings: (trainings ?? []) as ConfirmTraining[],
    attendance: (attendance ?? []) as { training_id: string; player_id: string }[],
    now,
  });
}
