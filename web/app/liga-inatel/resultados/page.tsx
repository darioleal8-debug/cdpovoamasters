import type { Metadata } from "next";
import Link from "next/link";
import { getCompetitionBySlug, getCompetitionGames, getOurTeamName } from "@/lib/competitions-data";
import { GamesCalendarClient } from "@/components/competitions/games-calendar-client";

export const metadata: Metadata = {
  title: "Resultados",
  description: "Resultados da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

export default async function ResultadosPage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition || !competition.season_id) {
    return <p className="text-center text-muted-foreground py-12">Competição não disponível.</p>;
  }

  const [games, ourTeam] = await Promise.all([
    getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id),
    getOurTeamName(),
  ]);

  const gamesWithResultOrPending = games.filter(
    (g) => g.result_status === "approved" || g.result_status === "pending"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resultados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {gamesWithResultOrPending.length} jogo{gamesWithResultOrPending.length !== 1 ? "s" : ""} com resultado
          </p>
        </div>
        <Link
          href="/liga-inatel/resultados/submeter"
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
        >
          + Submeter resultado
        </Link>
      </div>

      {gamesWithResultOrPending.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">Ainda não há resultados registados.</p>
          <Link href="/liga-inatel/resultados/submeter" className="text-orange-500 text-sm hover:underline">
            Foste a um jogo? Submete o resultado →
          </Link>
        </div>
      ) : (
        <GamesCalendarClient
          games={games}
          ourTeamName={ourTeam}
          competitionSlug="liga-inatel"
          mode="results"
        />
      )}
    </div>
  );
}
