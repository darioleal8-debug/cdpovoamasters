"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { PublicGame } from "@/types/competitions";
import { TeamMono, teamAbbr } from "./team-mono";

const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PT_DAYS   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
function fmtDay(s: string) {
  const d = new Date(s + "T12:00:00");
  return { wd: PT_DAYS[d.getDay()], day: d.getDate(), mon: PT_MONTHS[d.getMonth()] };
}

type Filter = "all" | "with_result" | "no_result";

interface Props {
  games: PublicGame[];
  competitionSlug: string;
  mode?: "calendar" | "results";
}

export function GamesCalendarClient({ games, competitionSlug, mode = "calendar" }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedJornada, setSelectedJornada] = useState<number | "all">("all");

  const counts = useMemo(() => ({
    all:         games.length,
    with_result: games.filter((g) => g.result_status === "approved").length,
    no_result:   games.filter((g) => g.result_status === "no_result").length,
  }), [games]);

  const jornadas = useMemo(() => {
    const set = new Set<number>();
    for (const g of games) if (g.syntheticJornada) set.add(g.syntheticJornada);
    return Array.from(set).sort((a, b) => a - b);
  }, [games]);

  const filtered = useMemo(() => {
    let result = [...games];

    if (mode === "results") {
      result = result.filter((g) => g.result_status === "approved" || g.result_status === "pending");
      result.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
    } else {
      result.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    }

    if (filter === "with_result") result = result.filter((g) => g.result_status === "approved");
    if (filter === "no_result")   result = result.filter((g) => g.result_status === "no_result");
    if (selectedJornada !== "all") result = result.filter((g) => g.syntheticJornada === selectedJornada);

    return result;
  }, [games, filter, selectedJornada, mode]);

  const grouped = useMemo(() => {
    const map = new Map<number, PublicGame[]>();
    for (const g of filtered) {
      const key = g.syntheticJornada ?? 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return Array.from(map.entries()).sort((a, b) => mode === "results" ? b[0] - a[0] : a[0] - b[0]);
  }, [filtered, mode]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",         label: "Todos" },
    { key: "with_result", label: "Com resultado" },
    { key: "no_result",   label: "Sem resultado" },
  ];

  return (
    <div>
      {/* Filtros em pílula */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "999px",
                border: `2px solid ${active ? "#1A1612" : "#D4CEC7"}`,
                background: active ? "#1A1612" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-barlow, sans-serif)",
                fontSize: "13px",
                fontWeight: 600,
                color: active ? "#F97316" : "#6F675F",
                transition: "all .15s",
                minHeight: "44px",
              }}
            >
              {f.label}
              <span
                style={{
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "10px",
                  fontWeight: 500,
                  opacity: 0.7,
                  letterSpacing: "0.05em",
                }}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selector de jornadas */}
      {jornadas.length > 1 && (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "24px" }}>
          {["all" as const, ...jornadas].map((j) => {
            const active = selectedJornada === j;
            return (
              <button
                key={j}
                onClick={() => setSelectedJornada(j)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: `1px solid ${active ? "#1A1612" : "#D4CEC7"}`,
                  background: active ? "#1A1612" : "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  color: active ? "#F97316" : "#8C837A",
                  transition: "all .12s",
                }}
              >
                {j === "all" ? "TODAS" : `J${j}`}
              </button>
            );
          })}
        </div>
      )}

      {grouped.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "#8C837A",
            fontFamily: "var(--font-barlow, sans-serif)",
            fontSize: "14px",
          }}
        >
          {mode === "results"
            ? "Ainda não há jogos com resultado. Os resultados aparecem aqui assim que forem aprovados."
            : "Nenhum jogo encontrado com os filtros seleccionados."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {grouped.map(([jornada, jornadaGames]) => {
            // intervalo de datas da jornada
            const dates = jornadaGames.map((g) => g.event_date).sort();
            const dateRange =
              dates.length > 1 && dates[0] !== dates[dates.length - 1]
                ? `${fmtDay(dates[0]).day} ${fmtDay(dates[0]).mon} – ${fmtDay(dates[dates.length - 1]).day} ${fmtDay(dates[dates.length - 1]).mon}`
                : `${fmtDay(dates[0]).day} ${fmtDay(dates[0]).mon}`;

            return (
              <section key={jornada}>
                {/* Cabeçalho da jornada */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "12px",
                    marginBottom: "12px",
                    paddingBottom: "8px",
                    borderBottom: "3px solid #1A1612",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                      fontWeight: 800,
                      fontSize: "22px",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "#1A1612",
                    }}
                  >
                    {jornada > 0 ? `JORNADA ${jornada}` : "SEM JORNADA"}
                  </span>
                  {dates.length > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-ibm-mono, monospace)",
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#8C837A",
                      }}
                    >
                      {dateRange}
                    </span>
                  )}
                </div>

                {/* Linhas de jogos */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {jornadaGames.map((g) => (
                    <GameRow key={g.id} game={g} competitionSlug={competitionSlug} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GameRow({ game, competitionSlug }: { game: PublicGame; competitionSlug: string }) {
  const { event_date, event_time, home_team, away_team, result, result_status, syntheticJornada, id } = game;
  const hasResult = result_status === "approved";
  const isLive    = result_status === "live";
  const { wd, day, mon } = fmtDay(event_date);
  const homeWon = hasResult && result && result.home_score > result.away_score;
  const awayWon = hasResult && result && result.away_score > result.home_score;

  const inner = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "52px 1fr auto 1fr",
        alignItems: "center",
        gap: "8px",
        padding: "10px 16px",
        borderRadius: "6px",
        background: "#FFFDFA",
        border: "1px solid #F0EAE1",
        minHeight: "52px",
        cursor: hasResult || isLive ? "pointer" : "default",
        transition: "background .12s",
      }}
      onMouseEnter={(e) => { if (hasResult || isLive) (e.currentTarget as HTMLElement).style.background = "#FFF4EA"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FFFDFA"; }}
    >
      {/* Col 1: data */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "9px",
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#F97316",
            lineHeight: 1.2,
          }}
        >
          {wd}
        </div>
        <div
          style={{
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 700,
            fontSize: "22px",
            color: "#1A1612",
            lineHeight: 1,
          }}
        >
          {day}
        </div>
        <div
          style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "9px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8C837A",
            lineHeight: 1.2,
          }}
        >
          {event_time ? event_time.slice(0, 5) : mon}
        </div>
      </div>

      {/* Col 2: equipa de casa — alinhada à direita */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "8px",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-barlow-condensed, sans-serif)",
            fontWeight: homeWon ? 700 : 400,
            fontSize: "14px",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: homeWon ? "#1A1612" : awayWon ? "#8C837A" : "#1A1612",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "right",
          }}
        >
          {home_team}
        </span>
        <TeamMono name={home_team} size={28} />
      </div>

      {/* Col 3: marcação central */}
      {hasResult && result ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            background: "#1A1612",
            borderRadius: "6px",
            padding: "5px 10px",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 800,
              fontSize: "20px",
              color: homeWon ? "#F6F2EC" : "#B9AFA4",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {result.home_score}
          </span>
          <span style={{ color: "#6F675F", fontSize: "14px", fontWeight: 400, margin: "0 2px" }}>–</span>
          <span
            style={{
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 800,
              fontSize: "20px",
              color: awayWon ? "#F6F2EC" : "#B9AFA4",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {result.away_score}
          </span>
        </div>
      ) : isLive ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#F97316",
            borderRadius: "6px",
            padding: "4px 8px",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "9px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: "#15110E",
              textTransform: "uppercase",
            }}
          >
            LIVE
          </span>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F0EAE1",
            borderRadius: "6px",
            padding: "5px 10px",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-barlow-condensed, sans-serif)",
              fontWeight: 600,
              fontSize: "13px",
              letterSpacing: "0.04em",
              color: "#C2530A",
            }}
          >
            vs
          </span>
        </div>
      )}

      {/* Col 4: equipa visitante — alinhada à esquerda */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
        }}
      >
        <TeamMono name={away_team} size={28} />
        <span
          style={{
            fontFamily: "var(--font-barlow-condensed, sans-serif)",
            fontWeight: awayWon ? 700 : 400,
            fontSize: "14px",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: awayWon ? "#1A1612" : homeWon ? "#8C837A" : "#1A1612",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {away_team}
        </span>
      </div>
    </div>
  );

  const href = isLive && game.live_game_url
    ? game.live_game_url
    : hasResult
    ? `/${competitionSlug}/jogo/${id}`
    : null;

  return href ? <Link href={href} style={{ display: "block", textDecoration: "none" }}>{inner}</Link> : inner;
}
