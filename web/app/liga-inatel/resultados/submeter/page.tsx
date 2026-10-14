import type { Metadata } from "next";
import { getCompetitionBySlug, getCompetitionGames } from "@/lib/competitions-data";
import { ResultSubmitForm } from "@/components/competitions/result-submit-form";

export const metadata: Metadata = {
  title: "Submeter resultado",
  description: "Submete o resultado de um jogo da Liga INATEL.",
};

export default async function SubmeterResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition || !competition.season_id) {
    return <p className="text-center text-muted-foreground py-12">Competição não disponível.</p>;
  }

  const allGames = await getCompetitionGames(
    competition.competition_key ?? "Liga",
    competition.season_id
  );

  const now = new Date();

  // Only show past games without an approved result
  const eligibleGames = allGames.filter(
    (g) => new Date(g.event_date) <= now && g.result_status !== "approved"
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submeter resultado</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tens o resultado de um jogo? Submete aqui — será analisado antes de ser publicado.
        </p>
      </div>

      <ResultSubmitForm
        games={eligibleGames}
        competitionId={competition.id}
        preselectedGameId={jogo}
      />
    </div>
  );
}
