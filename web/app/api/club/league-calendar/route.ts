import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createRawServiceClient } from "@/lib/supabase/service-raw";
import { clubIdForUser, leagueTeamNameForClub } from "@/lib/auth/club";

/**
 * Espelho só de leitura do calendário da Liga para o clube do utilizador.
 * Devolve o nome da equipa da Liga associada ao clube (clubs.league_team_id) e os
 * jogos partilhados da Liga (events.club_id IS NULL). Não duplica nada.
 */
export async function GET() {
  const a = await authorize();
  if (!a.ok) return a.response;

  const db = createRawServiceClient();
  const clubId = await clubIdForUser(db, a.user.id);
  if (!clubId) return NextResponse.json({ team_name: null, events: [] });

  const teamName = await leagueTeamNameForClub(db, clubId);
  if (!teamName) return NextResponse.json({ team_name: null, events: [] });

  const { data, error } = await db
    .from("events")
    .select("*")
    .is("club_id", null)
    .eq("type", "jogo")
    .eq("competition", "Liga")
    .not("description", "is", null)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team_name: teamName, events: data ?? [] });
}
