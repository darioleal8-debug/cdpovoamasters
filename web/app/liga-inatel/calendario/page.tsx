import type { Metadata } from "next";
import { getCompetitionBySlug, getCompetitionGames } from "@/lib/competitions-data";
import { CourtBg } from "@/components/competitions/court-bg";
import { GamesCalendarClient } from "@/components/competitions/games-calendar-client";

export const metadata: Metadata = {
  title: "Calendário",
  description: "Calendário de jogos da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

export default async function CalendarioPage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition || !competition.season_id) {
    return (
      <p style={{ textAlign: "center", padding: "60px 20px", color: "#6F675F" }}>
        Competição não disponível.
      </p>
    );
  }

  const games = await getCompetitionGames(
    competition.competition_key ?? "Liga",
    competition.season_id
  );

  const maxW = { maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" };

  return (
    <div>
      <CourtBg>
        <div style={{ ...maxW, padding: "40px 20px 36px" }}>
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#F97316",
              marginBottom: "8px",
            }}
          >
            LIGA INATEL
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 800,
              fontSize: "clamp(40px, 8vw, 72px)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#F6F2EC",
              lineHeight: 0.9,
              margin: "0 0 12px",
            }}
          >
            CALENDÁRIO
          </h1>
          <p
            style={{
              fontFamily: "var(--font-barlow, sans-serif)",
              fontSize: "14px",
              color: "#B9AFA4",
            }}
          >
            {games.length} jogo{games.length !== 1 ? "s" : ""} agendado{games.length !== 1 ? "s" : ""}
          </p>
        </div>
      </CourtBg>

      <div style={{ ...maxW, padding: "32px 20px 48px" }}>
        <GamesCalendarClient
          games={games}
          competitionSlug="liga-inatel"
          mode="calendar"
        />
      </div>
    </div>
  );
}
