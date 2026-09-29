import type { Metadata } from "next";
import Link from "next/link";
import { getCompetitionBySlug, getCompetitionGames, getStandings, getOurTeamName } from "@/lib/competitions-data";
import { createAdminClient } from "@/lib/supabase/server";
import { StandingsTable } from "@/components/competitions/standings-table";
import { GameCard } from "@/components/competitions/game-card";

export const metadata: Metadata = {
  title: "Liga INATEL",
  description: "Página oficial da Liga INATEL de basquetebol — CD Póvoa Masters.",
};

export const revalidate = 60;

export default async function LigaInatelHomePage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition || !competition.season_id) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>Competição não disponível.</p>
      </div>
    );
  }

  const [games, standings, ourTeam] = await Promise.all([
    getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id),
    getStandings(competition.id),
    getOurTeamName(),
  ]);

  const now = new Date();
  const pastGames = games.filter((g) => new Date(g.event_date) < now);
  const futureGames = games.filter((g) => new Date(g.event_date) >= now);

  const nextGame = futureGames[0] ?? null;
  const lastResult = [...pastGames].reverse().find((g) => g.result_status === "approved") ?? null;

  // Fetch season name
  const supabase = await createAdminClient();
  const { data: season } = await supabase
    .from("seasons")
    .select("name")
    .eq("id", competition.season_id)
    .single();

  const totalTeams = new Set([...games.map((g) => g.home_team), ...games.map((g) => g.away_team)]).size;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{competition.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {season?.name ?? "Época 2024/25"}
              {totalTeams > 0 && ` · ${totalTeams} equipas`}
              {games.length > 0 && ` · ${games.length} jogos`}
            </p>
          </div>
          <Link
            href="/liga-inatel/resultados/submeter"
            className="shrink-0 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
          >
            Submeter resultado
          </Link>
        </div>

        {/* Next game + last result cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {nextGame && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2">Próximo jogo</p>
              <GameCard game={nextGame} competitionSlug="liga-inatel" compact />
            </div>
          )}
          {lastResult && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
              <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">Último resultado</p>
              <GameCard game={lastResult} competitionSlug="liga-inatel" compact />
            </div>
          )}
        </div>
      </section>

      {/* Standings preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Classificação</h2>
          <Link href="/liga-inatel/classificacao" className="text-xs text-orange-500 hover:underline">
            Ver completa →
          </Link>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <StandingsTable standings={standings} ourTeamName={ourTeam} limit={5} />
        </div>
        {standings.length > 5 && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Mostrando top 5 de {standings.length} equipas ·{" "}
            <Link href="/liga-inatel/classificacao" className="text-orange-500 hover:underline">ver todas</Link>
          </p>
        )}
      </section>

      {/* Upcoming games preview */}
      {futureGames.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Próximos jogos</h2>
            <Link href="/liga-inatel/calendario" className="text-xs text-orange-500 hover:underline">
              Ver calendário →
            </Link>
          </div>
          <div className="space-y-2">
            {futureGames.slice(0, 3).map((g) => (
              <GameCard key={g.id} game={g} competitionSlug="liga-inatel" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
