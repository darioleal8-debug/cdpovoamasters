import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getTeamBySlug,
  getCompetitionBySlug,
  getCompetitionGames,
  getStandingsWithForm,
} from "@/lib/competitions-data";
import { CourtBg } from "@/components/competitions/court-bg";
import { GamesCalendarClient } from "@/components/competitions/games-calendar-client";
import { TeamAvatar } from "@/components/liga/team-avatar";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) return { title: "Equipa não encontrada" };
  return {
    title: team.name,
    description: `Jogos e resultados de ${team.name} na Liga INATEL.`,
  };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [team, competition] = await Promise.all([
    getTeamBySlug(slug),
    getCompetitionBySlug("liga-inatel"),
  ]);

  if (!team || !competition?.season_id) notFound();

  const [allGames, standings] = await Promise.all([
    getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id),
    getStandingsWithForm(competition.id),
  ]);

  const teamGames = allGames.filter(
    (g) =>
      g.home_team.toLowerCase() === team.name.toLowerCase() ||
      g.away_team.toLowerCase() === team.name.toLowerCase() ||
      g.home_team.toLowerCase().includes(team.normalized_name) ||
      g.away_team.toLowerCase().includes(team.normalized_name)
  );

  const teamStanding = standings.find(
    (s) => s.team_name.toLowerCase() === team.name.toLowerCase()
  );
  const position = teamStanding
    ? standings.findIndex((s) => s.team_name === teamStanding.team_name) + 1
    : null;

  const maxW = { maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" };


  return (
    <div>
      <CourtBg>
        <div style={{ ...maxW, padding: "40px 20px 36px" }}>
          <p style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "11px", fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#F97316", marginBottom: "8px",
          }}>
            LIGA INATEL · EQUIPA
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <TeamAvatar
              name={team.name}
              logoUrl={team.logo_url}
              updatedAt={team.updated_at}
              sigla={team.sigla}
              size={60}
              radius={10}
              initBg="rgba(249,115,22,.15)"
              initColor="#F97316"
            />
            <div>
              <h1 style={{
                fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                fontWeight: 800, fontSize: "clamp(32px, 6vw, 56px)",
                letterSpacing: "0.04em", textTransform: "uppercase",
                color: "#F6F2EC", lineHeight: 0.9, margin: "0 0 8px",
              }}>
                {team.name}
              </h1>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {team.locality && (
                  <span style={{
                    fontFamily: "var(--font-ibm-mono, monospace)",
                    fontSize: "11px", fontWeight: 500,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "#B9AFA4",
                  }}>
                    {team.locality}
                  </span>
                )}
                {team.home_pavilion && (
                  <span style={{
                    fontFamily: "var(--font-ibm-mono, monospace)",
                    fontSize: "11px", fontWeight: 500,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "#8C837A",
                  }}>
                    {team.home_pavilion}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CourtBg>

      <div style={{ ...maxW, padding: "32px 20px 48px" }}>
        {/* Stats strip */}
        {teamStanding && (
          <div style={{
            display: "flex", gap: "2px", marginBottom: "32px",
            background: "#FFFDFA", borderRadius: "8px", overflow: "hidden",
            border: "1px solid #E8E0D6",
          }}>
            {[
              { label: "Posição", value: position ? `${position}º` : "—" },
              { label: "J",  value: teamStanding.gp },
              { label: "V",  value: teamStanding.wins },
              { label: "D",  value: teamStanding.losses },
              { label: "PM", value: teamStanding.pf },
              { label: "PS", value: teamStanding.pc },
              { label: "Dif", value: teamStanding.diff > 0 ? `+${teamStanding.diff}` : teamStanding.diff },
              { label: "Pts", value: teamStanding.pts },
            ].map(({ label, value }) => (
              <div key={label} style={{
                flex: 1, padding: "12px 4px", textAlign: "center",
                borderRight: "1px solid #F0EAE1",
              }}>
                <p style={{
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "9px", fontWeight: 500,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "#8C837A", margin: "0 0 2px",
                }}>
                  {label}
                </p>
                <p style={{
                  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                  fontWeight: 800, fontSize: "20px",
                  color: label === "Pts" ? "#F97316" : "#1A1612",
                  fontVariantNumeric: "tabular-nums", margin: 0,
                }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Últimos 5 */}
        {teamStanding && teamStanding.form.length > 0 && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "24px" }}>
            <span style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px", fontWeight: 500, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#8C837A", marginRight: "4px",
            }}>
              Forma
            </span>
            {teamStanding.form.map((r, i) => (
              <span key={i} style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                fontWeight: 800, fontSize: "12px", letterSpacing: "0.04em",
                background: r === "V" ? "#16A34A" : "#DC2626",
                color: "#fff",
              }}>
                {r}
              </span>
            ))}
          </div>
        )}

        <h2 style={{
          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
          fontWeight: 800, fontSize: "18px", letterSpacing: "0.06em",
          textTransform: "uppercase", color: "#1A1612",
          marginBottom: "16px",
        }}>
          Jogos ({teamGames.length})
        </h2>

        {teamGames.length === 0 ? (
          <p style={{ color: "#8C837A", fontSize: "14px" }}>
            Nenhum jogo encontrado para esta equipa.
          </p>
        ) : (
          <GamesCalendarClient
            games={teamGames}
            competitionSlug="liga-inatel"
            mode="calendar"
            initialTeam={team.name}
          />
        )}
      </div>
    </div>
  );
}
