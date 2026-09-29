import type { Metadata } from "next";
import { getCompetitionBySlug, getStandings, getOurTeamName } from "@/lib/competitions-data";
import { StandingsTable } from "@/components/competitions/standings-table";

export const metadata: Metadata = {
  title: "Classificação",
  description: "Classificação da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

export default async function ClassificacaoPage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition) {
    return <p className="text-center text-muted-foreground py-12">Competição não disponível.</p>;
  }

  const [standings, ourTeam] = await Promise.all([
    getStandings(competition.id),
    getOurTeamName(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Classificação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {standings.length} equipa{standings.length !== 1 ? "s" : ""} · regras INATEL: vitória 2 pts, derrota 1 pt
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <StandingsTable standings={standings} ourTeamName={ourTeam} />
      </div>

      {standings.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          A classificação será actualizada assim que os primeiros resultados forem aprovados.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Critérios de desempate: pontos → diferença de pontos → pontos marcados
      </p>
    </div>
  );
}
