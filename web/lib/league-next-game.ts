import "server-only";
import { leagueTeamNameForClub } from "@/lib/auth/club";
import { opponentIfTeamPlays } from "@/lib/league-mirror";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

export interface LeagueNextGame {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  opponent: string;
  description: string | null;
  /** O clube joga em casa (relativo à equipa da Liga do clube, não à flag is_home do CD Póvoa). */
  isHome: boolean;
  homeTeam: string;
  awayTeam: string;
}

/**
 * Próximo jogo da Liga da equipa do clube, vindo do calendário único (events de qualquer club_id).
 * null se o clube não tem equipa da Liga ou não há jogos futuros.
 */
export async function nextLeagueGameForClub(db: Db, clubId: string, today: string): Promise<LeagueNextGame | null> {
  const teamName = await leagueTeamNameForClub(db, clubId);
  if (!teamName) return null;
  const { data } = await db.from("events")
    .select("id,title,event_date,event_time,location,description")
    .eq("type", "jogo").eq("competition", "Liga").is("deleted_at", null)
    .not("description", "is", null)
    .gte("event_date", today)
    .order("event_date", { ascending: true }).order("event_time", { ascending: true });
  for (const ev of (data ?? []) as Omit<LeagueNextGame, "opponent" | "isHome" | "homeTeam" | "awayTeam">[]) {
    const side = opponentIfTeamPlays(ev.description, teamName);
    if (!side) continue;
    return {
      ...ev,
      opponent: side.opponent,
      isHome: side.isHome,
      homeTeam: side.isHome ? teamName : side.opponent,
      awayTeam: side.isHome ? side.opponent : teamName,
    };
  }
  return null;
}
