import "server-only";
import type { createRawServiceClient } from "@/lib/supabase/service-raw";
import { matchLeagueTeam } from "@/lib/league-mirror";

type AdminDb = ReturnType<typeof createRawServiceClient>;

/**
 * Procura a equipa da Liga INATEL com o mesmo nome do clube e que ainda não esteja associada a outro clube.
 * Devolve o id ou null (sem correspondência única → o Master Admin associa manualmente).
 * Quando associada, o clube passa a "beber" o calendário da Liga (espelho só de leitura).
 */
export async function findLeagueTeamIdForClubName(admin: AdminDb, clubName: string): Promise<string | null> {
  const [{ data: teams }, { data: used }] = await Promise.all([
    admin.from("league_teams").select("id, name, is_placeholder"),
    admin.from("clubs").select("league_team_id").not("league_team_id", "is", null),
  ]);
  const usedIds = new Set((used ?? []).map((c) => c.league_team_id as string));
  return matchLeagueTeam(clubName, teams ?? [], usedIds)?.id ?? null;
}
