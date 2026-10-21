import type { Metadata } from "next";
import Link from "next/link";
import { getLeagueTeamsWithDetails } from "@/lib/competitions-data";
import { CourtBg } from "@/components/competitions/court-bg";

export const metadata: Metadata = {
  title: "Equipas",
  description: "Todas as equipas da Liga INATEL de basquetebol.",
};

export const revalidate = 300;

export default async function EquipasPage() {
  const teams = await getLeagueTeamsWithDetails();
  const realTeams = teams.filter((t) => !t.is_placeholder);

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
            LIGA INATEL
          </p>
          <h1 style={{
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 800, fontSize: "clamp(40px, 8vw, 72px)",
            letterSpacing: "0.04em", textTransform: "uppercase",
            color: "#F6F2EC", lineHeight: 0.9, margin: "0 0 12px",
          }}>
            EQUIPAS
          </h1>
          <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "14px", color: "#B9AFA4" }}>
            {realTeams.length} equipa{realTeams.length !== 1 ? "s" : ""} participantes
          </p>
        </div>
      </CourtBg>

      <div style={{ ...maxW, padding: "32px 20px 48px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "12px",
        }}>
          {realTeams.map((team) => (
            <Link
              key={team.id}
              href={team.slug ? `/liga-inatel/equipas/${team.slug}` : "#"}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  background: "#FFFDFA",
                  border: "1px solid #E8E0D6",
                  borderRadius: "8px",
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  transition: "transform .12s, box-shadow .12s",
                  cursor: team.slug ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  if (team.slug) {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(26,22,18,.12)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow = "";
                }}
              >
                {/* Initials badge */}
                <div style={{
                  width: "44px", height: "44px", borderRadius: "8px", flexShrink: 0,
                  background: "#F0EAE1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                  fontWeight: 800, fontSize: "14px", letterSpacing: "0.04em",
                  color: "#6F675F",
                }}>
                  {(team.sigla ?? team.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase())}
                </div>

                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontFamily: "var(--font-barlow-condensed, sans-serif)",
                    fontWeight: 700, fontSize: "15px",
                    letterSpacing: "0.02em", textTransform: "uppercase",
                    color: "#1A1612",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    margin: 0,
                  }}>
                    {team.name}
                  </p>
                  {(team.locality || team.home_pavilion) && (
                    <p style={{
                      fontFamily: "var(--font-ibm-mono, monospace)",
                      fontSize: "10px", fontWeight: 500,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "#8C837A",
                      margin: "2px 0 0",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {team.locality ?? team.home_pavilion}
                    </p>
                  )}
                </div>

                {team.slug && (
                  <svg
                    style={{ marginLeft: "auto", flexShrink: 0 }}
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                  >
                    <path d="M6 3l5 5-5 5" stroke="#C2A882" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
