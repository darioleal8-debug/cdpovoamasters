import type { Metadata } from "next";
import { getCompetitionBySlug, getCompetitionGames, getOurTeamName } from "@/lib/competitions-data";
import { GamesCalendarClient } from "@/components/competitions/games-calendar-client";

export const metadata: Metadata = {
  title: "Calendário",
  description: "Calendário de jogos da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

export default async function CalendarioPage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition || !competition.season_id) {
    return <p className="text-center text-muted-foreground py-12">Competição não disponível.</p>;
  }

  const [games, ourTeam] = await Promise.all([
    getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id),
    getOurTeamName(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
        <p className="text-sm text-muted-foreground mt-1">{games.length} jogos</p>
      </div>

      <GamesCalendarClient
        games={games}
        ourTeamName={ourTeam}
        competitionSlug="liga-inatel"
        mode="calendar"
      />
    </div>
  );
}
