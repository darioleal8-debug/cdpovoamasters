import type { Metadata } from "next";
import { getCompetitionBySlug, getStandingsWithFormBySeries, getTeamLogos } from "@/lib/competitions-data";
import { CourtBg } from "@/components/competitions/court-bg";
import { StandingsTable } from "@/components/competitions/standings-table";

export const metadata: Metadata = {
  title: "Classificação",
  description: "Classificação da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

export default async function ClassificacaoPage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition) {
    return <p style={{ textAlign: "center", padding: "60px 20px", color: "#6F675F" }}>Competição não disponível.</p>;
  }

  const [seriesGroups, teamLogos] = await Promise.all([
    getStandingsWithFormBySeries(competition.id),
    getTeamLogos(),
  ]);

  const standings = seriesGroups.flatMap((g) => g.rows);
  const rows = standings;
  const namedSeries = seriesGroups.filter((g) => g.series !== null).length;

  const maxW = { maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" };
  const cardStyle = {
    background: "#FFFDFA",
    borderRadius: "8px",
    boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
    overflow: "hidden",
  } as const;

  return (
    <div>
      {/* Cabeçalho de página */}
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
            CLASSIFICAÇÃO
          </h1>
          <p
            style={{
              fontFamily: "var(--font-barlow, sans-serif)",
              fontSize: "14px",
              color: "#B9AFA4",
            }}
          >
            {rows.length} equipa{rows.length !== 1 ? "s" : ""}
            {namedSeries > 1 ? ` · ${namedSeries} séries` : ""}
            {standings.some((s) => s.gp > 0)
              ? ` · após ${Math.max(...standings.map((s) => s.gp))} jogos por equipa`
              : ""}
          </p>
        </div>
      </CourtBg>

      {/* Tabelas por série */}
      <div style={{ ...maxW, padding: "32px 20px 48px" }}>
        {seriesGroups.length === 0 && (
          <div style={cardStyle}>
            <StandingsTable standings={[]} teamLogos={teamLogos} />
          </div>
        )}

        {seriesGroups.map((group) => (
          <section
            key={group.series ?? "sem-serie"}
            id={group.series ? `serie-${group.series.toLowerCase()}` : "sem-serie"}
            style={{ marginBottom: "32px", scrollMarginTop: "80px" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                  fontWeight: 800,
                  fontSize: "28px",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#1A1612",
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                {group.label}
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#8C837A",
                }}
              >
                {group.rows.length} equipa{group.rows.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div style={cardStyle}>
              <StandingsTable standings={group.rows} teamLogos={teamLogos} />
            </div>
          </section>
        ))}

        <div
          style={{
            marginTop: "16px",
            display: "flex",
            gap: "24px",
            flexWrap: "wrap",
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8C837A",
          }}
        >
          <span>Pontuação: vitória 2 pts · derrota 1 pt</span>
          <span>Desempate: pontos → diferença → pm</span>
        </div>
      </div>
    </div>
  );
}
