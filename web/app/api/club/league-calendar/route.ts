import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createRawServiceClient } from "@/lib/supabase/service-raw";
import { clubIdForUser, leagueTeamNameForClub } from "@/lib/auth/club";

/**
 * Espelho só de leitura do calendário da Liga para o clube do utilizador.
 * Devolve o nome da equipa da Liga associada ao clube (clubs.league_team_id) e TODOS os
 * jogos da Liga (qualquer club_id): os partilhados (club_id NULL) e os que pertencem a outro
 * clube (ex.: jogos do CD Póvoa). É o calendário oficial único — um reagendamento feito na
 * Liga aparece logo a todos os clubes. Não duplica nada.
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
    .eq("type", "jogo")
    .eq("competition", "Liga")
    .is("deleted_at", null)
    .not("description", "is", null)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team_name: teamName, events: data ?? [] });
}
