import type { PublicGame } from "@/types/competitions";
import { TeamMono } from "./team-mono";

const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PT_DAYS   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
function fmtShort(s: string) {
  const d = new Date(s + "T12:00:00");
  return `${PT_DAYS[d.getDay()]} ${d.getDate()} ${PT_MONTHS[d.getMonth()]}`;
}

interface Props {
  game: PublicGame;
}

export function ScoreCard({ game }: Props) {
  const { result, home_team, away_team, event_date, location, syntheticJornada } = game;
  if (!result) return null;
  const homeWon = result.home_score > result.away_score;

  return (
    <article
      style={{
        background: "#FFFDFA",
        borderRadius: "8px",
        boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
        overflow: "hidden",
      }}
    >
      {/* Topo escuro */}
      <div
        style={{
          background: "#1A1612",
          padding: "8px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#F97316",
            fontWeight: 500,
          }}
        >
          FINAL{syntheticJornada ? ` · J${syntheticJornada}` : ""}
        </span>
        <span
          style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#B9AFA4",
            fontWeight: 500,
          }}
        >
          {fmtShort(event_date)}
        </span>
      </div>

      {/* Equipas */}
      <div style={{ padding: "10px 16px 0" }}>
        {(
          [
            { name: home_team,  score: result.home_score, won: homeWon },
            { name: away_team, score: result.away_score, won: !homeWon },
          ] as const
        ).map((t, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "6px 0",
            }}
          >
            {/* Marcador vencedor */}
            <div
              style={{
                width: 4,
                height: 36,
                background: t.won ? "#F97316" : "transparent",
                borderRadius: "2px",
                flexShrink: 0,
              }}
            />
            <TeamMono name={t.name} size={34} />
            <span
              style={{
                flex: 1,
                fontFamily: "var(--font-barlow-condensed, sans-serif)",
                fontWeight: 700,
                fontSize: "15px",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                color: t.won ? "#1A1612" : "#8C837A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                fontWeight: 800,
                fontSize: "38px",
                lineHeight: 1,
                color: t.won ? "#1A1612" : "#8C837A",
                letterSpacing: "-0.01em",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {t.score}
            </span>
          </div>
        ))}
      </div>

      {/* Local */}
      {location ? (
        <>
          <div style={{ margin: "8px 16px 0", borderTop: "1px dashed #E9E2D8" }} />
          <div
            style={{
              padding: "7px 16px",
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "11px",
              color: "#6F675F",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {location}
          </div>
        </>
      ) : (
        <div style={{ height: 12 }} />
      )}
    </article>
  );
}
