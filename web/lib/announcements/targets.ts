import "server-only";
import { leagueTeamNameForClub } from "@/lib/auth/club";
import { todayInClubTz } from "@/lib/time/club-time";
import { gameEndsAt, trainingEndsAt } from "./expiry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/** Até onde se pode afetar um comunicado a um jogo/treino futuro. */
export const TARGET_HORIZON_DAYS = 90;

export interface GameOption {
  id: string; title: string; opponent: string | null; competition: string | null;
  event_date: string; event_time: string | null;
}
export interface TrainingOption {
  id: string; date: string; start_time: string | null; end_time: string | null; type: string | null;
}

type GameRow = GameOption & { description?: string | null };

/**
 * Jogos do clube ainda por terminar: os da própria época (is_club_game) e, se o clube estiver ligado a uma
 * equipa da Liga, os jogos partilhados da Liga/Taça dessa equipa (mesma regra do Dashboard).
 */
export async function listUpcomingGames(db: Db, clubId: string, now: Date = new Date()): Promise<GameOption[]> {
  const today = todayInClubTz(new Date(now.getTime() - 86_400_000)); // inclui ontem: cobre jogos que acabam depois da meia-noite
  const horizon = todayInClubTz(new Date(now.getTime() + TARGET_HORIZON_DAYS * 86_400_000));
  const cols = "id,title,opponent,competition,event_date,event_time,description";

  const [ownRes, teamName] = await Promise.all([
    db.from("events").select(cols)
      .eq("type", "jogo").eq("is_club_game", true).eq("club_id", clubId)
      .is("deleted_at", null).gte("event_date", today).lte("event_date", horizon)
      .order("event_date", { ascending: true }).order("event_time", { ascending: true }),
    leagueTeamNameForClub(db, clubId),
  ]);

  const byKey = new Map<string, GameRow>();
  const key = (g: GameRow) => `${g.event_date}|${(g.event_time ?? "").slice(0, 5)}`;
  for (const g of (ownRes.data ?? []) as GameRow[]) byKey.set(key(g), g);

  if (teamName) {
    const { data: shared } = await db.from("events").select(cols)
      .is("club_id", null).eq("type", "jogo").is("deleted_at", null)
      .not("description", "is", null)
      .gte("event_date", today).lte("event_date", horizon)
      .order("event_date", { ascending: true }).order("event_time", { ascending: true });
    for (const ev of (shared ?? []) as GameRow[]) {
      let home: string | undefined, away: string | undefined;
      try {
        const meta = JSON.parse(ev.description as string) as { home_team?: string; away_team?: string };
        home = meta.home_team; away = meta.away_team;
      } catch { continue; }
      if (home !== teamName && away !== teamName) continue;
      // Em caso de empate de data/hora prevalece o jogo da época do clube
      if (!byKey.has(key(ev))) byKey.set(key(ev), { ...ev, opponent: (home === teamName ? away : home) ?? ev.opponent });
    }
  }

  return [...byKey.values()]
    .filter((g) => gameEndsAt(g.event_date, g.event_time).getTime() > now.getTime())
    .sort((a, b) => key(a).localeCompare(key(b)))
    .map(({ id, title, opponent, competition, event_date, event_time }) => ({ id, title, opponent, competition, event_date, event_time }));
}

/** Treinos do clube ainda por terminar (a BD do clube já vem isolada pelo cliente com âmbito). */
export async function listUpcomingTrainings(db: Db, now: Date = new Date()): Promise<TrainingOption[]> {
  const today = todayInClubTz(new Date(now.getTime() - 86_400_000));
  const horizon = todayInClubTz(new Date(now.getTime() + TARGET_HORIZON_DAYS * 86_400_000));
  const { data } = await db.from("trainings")
    .select("id,date,start_time,end_time,type")
    .is("deleted_at", null).gte("date", today).lte("date", horizon)
    .order("date", { ascending: true }).order("start_time", { ascending: true });
  return ((data ?? []) as TrainingOption[]).filter((t) => trainingEndsAt(t).getTime() > now.getTime());
}
