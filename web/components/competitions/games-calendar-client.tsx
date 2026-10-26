"use client";

import { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import type { PublicGame } from "@/types/competitions";
import { TeamMono, teamAbbr } from "./team-mono";

const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PT_DAYS   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
function fmtDay(s: string) {
  const d = new Date(s + "T12:00:00");
  return { wd: PT_DAYS[d.getDay()], day: d.getDate(), mon: PT_MONTHS[d.getMonth()] };
}

type Filter = "all" | "with_result" | "validating" | "no_result";

const LS_KEY = "liga-team-filter";

interface Props {
  games: PublicGame[];
  competitionSlug: string;
  mode?: "calendar" | "results";
  teams?: string[];
  initialTeam?: string;
  teamLogos?: Record<string, string | null>;
}

/** Ids de jogos cujo event_date é >7 dias da data modal da jornada (provavelmente adiados) */
function getPostponedIds(jornadaGames: PublicGame[]): Set<string> {
  if (jornadaGames.length <= 1) return new Set();
  const freq = new Map<string, number>();
  for (const g of jornadaGames) freq.set(g.event_date, (freq.get(g.event_date) ?? 0) + 1);
  let modeDate = jornadaGames[0].event_date;
  let maxFreq = 0;
  for (const [date, count] of freq) if (count > maxFreq) { maxFreq = count; modeDate = date; }
  const modeTime = new Date(modeDate + "T12:00:00").getTime();
  return new Set(
    jornadaGames
      .filter((g) => Math.abs(new Date(g.event_date + "T12:00:00").getTime() - modeTime) > 7 * 86_400_000)
      .map((g) => g.id)
  );
}

/** Intervalo de datas do núcleo da jornada (excluindo adiados) */
function coreDateRange(jornadaGames: PublicGame[], postponedIds: Set<string>): string {
  const src = jornadaGames.filter((g) => !postponedIds.has(g.id));
  const dates = (src.length > 0 ? src : jornadaGames).map((g) => g.event_date).sort();
  const first = fmtDay(dates[0]);
  if (dates.length > 1 && dates[0] !== dates[dates.length - 1]) {
    const last = fmtDay(dates[dates.length - 1]);
    return `${first.day} ${first.mon} – ${last.day} ${last.mon}`;
  }
  return `${first.day} ${first.mon}`;
}

// ─── Inner component (uses Suspense-guarded hooks) ────────────────────────────

function GamesCalendarInner({
  games,
  competitionSlug,
  mode = "calendar",
  teams,
  initialTeam,
  teamLogos,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedJornada, setSelectedJornada] = useState<number | "all">("all");
  const [selectedTeam, setSelectedTeamState] = useState<string | "all">(() => {
    if (initialTeam) return initialTeam;
    try { return localStorage.getItem(LS_KEY) ?? "all"; } catch { return "all"; }
  });

  function setSelectedTeam(team: string | "all") {
    setSelectedTeamState(team);
    try { localStorage.setItem(LS_KEY, team); } catch {}
  }

  // Jogos base após filtro de equipa
  const baseGames = useMemo(
    () =>
      selectedTeam !== "all"
        ? games.filter((g) => g.home_team === selectedTeam || g.away_team === selectedTeam)
        : games,
    [games, selectedTeam]
  );

  const counts = useMemo(
    () => ({
      all:         baseGames.length,
      with_result: baseGames.filter((g) => g.result_status === "approved").length,
      validating:  baseGames.filter((g) => g.result_status === "pending").length,
      no_result:   baseGames.filter((g) => g.result_status === "no_result").length,
    }),
    [baseGames]
  );

  const jornadas = useMemo(() => {
    const set = new Set<number>();
    for (const g of baseGames) if (g.syntheticJornada) set.add(g.syntheticJornada);
    return Array.from(set).sort((a, b) => a - b);
  }, [baseGames]);

  const filtered = useMemo(() => {
    let result = [...baseGames];

    if (mode === "results") {
      result = result.filter((g) => g.result_status === "approved" || g.result_status === "pending");
      result.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
    } else {
      result.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    }

    if (filter === "with_result") result = result.filter((g) => g.result_status === "approved");
    if (filter === "validating")  result = result.filter((g) => g.result_status === "pending");
    if (filter === "no_result")   result = result.filter((g) => g.result_status === "no_result");
    if (selectedJornada !== "all") result = result.filter((g) => g.syntheticJornada === selectedJornada);

    return result;
  }, [baseGames, filter, selectedJornada, mode]);

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
    { key: "validating",  label: "A validar" },
    { key: "no_result",   label: "Sem resultado" },
  ];

  return (
    <div>
      {/* ── Pílulas de estado ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count  = counts[f.key];
          if (f.key !== "all" && count === 0) return null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "7px 14px", borderRadius: "999px",
                border: `2px solid ${active ? "#1A1612" : "#D4CEC7"}`,
                background: active ? "#1A1612" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-barlow, sans-serif)",
                fontSize: "13px", fontWeight: 600,
                color: active ? "#F97316" : "#6F675F",
                transition: "all .15s", minHeight: "44px",
              }}
            >
              {f.label}
              <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", fontWeight: 500, opacity: 0.7, letterSpacing: "0.05em" }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Selector de equipa ────────────────────────────────── */}
      {teams && teams.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            style={{
              padding: "7px 12px", borderRadius: "6px",
              border: "1px solid #D4CEC7",
              background: selectedTeam !== "all" ? "#1A1612" : "transparent",
              color: selectedTeam !== "all" ? "#F97316" : "#6F675F",
              fontFamily: "var(--font-barlow, sans-serif)",
              fontSize: "13px", fontWeight: 600,
              cursor: "pointer", minHeight: "44px", minWidth: "180px",
            }}
          >
            <option value="all">Todas as equipas</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* ── Selector de jornadas ──────────────────────────────── */}
      {jornadas.length > 1 && (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "24px" }}>
          {(["all" as const, ...jornadas]).map((j) => {
            const active = selectedJornada === j;
            return (
              <button
                key={j}
                onClick={() => setSelectedJornada(j)}
                style={{
                  padding: "4px 10px", borderRadius: "4px",
                  border: `1px solid ${active ? "#1A1612" : "#D4CEC7"}`,
                  background: active ? "#1A1612" : "transparent",
                  cursor: "pointer",
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "11px", fontWeight: 500, letterSpacing: "0.06em",
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

      {/* ── Grupos por jornada ────────────────────────────────── */}
      {grouped.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#8C837A", fontFamily: "var(--font-barlow, sans-serif)", fontSize: "14px" }}>
          {mode === "results"
            ? "Ainda não há jogos com resultado. Os resultados aparecem aqui assim que forem aprovados."
            : "Nenhum jogo encontrado com os filtros seleccionados."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {grouped.map(([jornada, jornadaGames]) => {
            const postponedIds = getPostponedIds(jornadaGames);
            const dateRange = coreDateRange(jornadaGames, postponedIds);

            return (
              <section key={jornada}>
                {/* Cabeçalho da jornada */}
                <div
                  style={{
                    display: "flex", alignItems: "baseline", gap: "12px",
                    marginBottom: "12px", paddingBottom: "8px",
                    borderBottom: "3px solid #1A1612",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: 800, fontSize: "22px", letterSpacing: "0.05em", textTransform: "uppercase", color: "#1A1612" }}>
                    {jornada > 0 ? `JORNADA ${jornada}` : "SEM JORNADA"}
                  </span>
                  <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8C837A" }}>
                    {dateRange}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {jornadaGames.map((g) => (
                    <GameRow
                      key={g.id}
                      game={g}
                      competitionSlug={competitionSlug}
                      isPostponed={postponedIds.has(g.id)}
                      highlightOurs={selectedTeam === "all"}
                      teamLogos={teamLogos}
                    />
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

export function GamesCalendarClient(props: Props) {
  return (
    <Suspense>
      <GamesCalendarInner {...props} />
    </Suspense>
  );
}

// ─── GameRow ──────────────────────────────────────────────────────────────────

const STATUS: Record<string, { text: string; color: string; bg: string }> = {
  approved: { text: "FINAL",     color: "#1A1612", bg: "rgba(26,22,18,.08)" },
  pending:  { text: "A VALIDAR", color: "#92400E", bg: "#FEF3C7" },
  live:     { text: "AO VIVO",   color: "#fff",    bg: "#F97316" },
};

function GameRow({
  game,
  competitionSlug,
  highlightOurs = false,
  isPostponed = false,
  teamLogos,
}: {
  game: PublicGame;
  competitionSlug: string;
  highlightOurs?: boolean;
  isPostponed?: boolean;
  teamLogos?: Record<string, string | null>;
}) {
  const isOurGame = highlightOurs && game.is_our_game;
  const { event_date, event_time, home_team, away_team, result, result_status, location, id } = game;
  const hasResult = result_status === "approved";
  const isLive    = result_status === "live";
  const isPending = result_status === "pending";

  const { wd, day, mon } = fmtDay(event_date);
  const homeWon = hasResult && result && result.home_score > result.away_score;
  const awayWon = hasResult && result && result.away_score > result.home_score;

  const statusInfo = isPostponed
    ? { text: "ADIADO", color: "#6B5A4E", bg: "#F0E8DF" }
    : STATUS[result_status] ?? null;

  const inner = (
    <div
      style={{
        borderRadius: "6px",
        background: isOurGame ? "#FFFAF5" : "#FFFDFA",
        border: "1px solid #F0EAE1",
        borderLeft: isOurGame ? "3px solid #F97316" : "1px solid #F0EAE1",
        overflow: "hidden",
        transition: "background .12s",
        cursor: hasResult || isLive || isPending ? "pointer" : "default",
      }}
      onMouseEnter={(e) => { if (hasResult || isLive || isPending) (e.currentTarget as HTMLElement).style.background = "#FFF4EA"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isOurGame ? "#FFFAF5" : "#FFFDFA"; }}
    >
      {/* Linha principal */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "52px 1fr auto 1fr",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          minHeight: "52px",
        }}
      >
        {/* Data */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "9px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#F97316", lineHeight: 1.2 }}>
            {wd}
          </div>
          <div style={{ fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: 700, fontSize: "22px", color: "#1A1612", lineHeight: 1 }}>
            {day}
          </div>
          <div style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "9px", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8C837A", lineHeight: 1.3 }}>
            {mon}{event_time ? ` · ${event_time.slice(0, 5)}` : ""}
          </div>
        </div>

        {/* Equipa de casa */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", minWidth: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-barlow-condensed, sans-serif)",
              fontWeight: homeWon ? 700 : 400,
              fontSize: "14px", letterSpacing: "0.02em", textTransform: "uppercase",
              color: homeWon ? "#1A1612" : awayWon ? "#8C837A" : "#1A1612",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right",
            }}
          >
            {home_team}
          </span>
          <TeamMono name={home_team} size={28} logoUrl={teamLogos?.[home_team]} showLabel />
        </div>

        {/* Centro: marcação + badge de estado */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flexShrink: 0 }}>
          {hasResult && result ? (
            <div style={{ display: "flex", alignItems: "center", gap: "2px", background: "#1A1612", borderRadius: "6px", padding: "5px 10px" }}>
              <span style={{ fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: 800, fontSize: "20px", color: homeWon ? "#F6F2EC" : "#B9AFA4", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {result.home_score}
              </span>
              <span style={{ color: "#6F675F", fontSize: "14px", fontWeight: 400, margin: "0 2px" }}>–</span>
              <span style={{ fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: 800, fontSize: "20px", color: awayWon ? "#F6F2EC" : "#B9AFA4", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {result.away_score}
              </span>
            </div>
          ) : isLive ? (
            <div style={{ background: "#F97316", borderRadius: "6px", padding: "4px 10px" }}>
              <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.1em", color: "#15110E", textTransform: "uppercase" }}>
                LIVE
              </span>
            </div>
          ) : (
            <div style={{ background: "#F0EAE1", borderRadius: "6px", padding: "5px 10px" }}>
              <span style={{ fontFamily: "var(--font-barlow-condensed, sans-serif)", fontWeight: 600, fontSize: "13px", letterSpacing: "0.04em", color: "#C2530A" }}>
                vs
              </span>
            </div>
          )}
          {statusInfo && result_status !== "live" && (
            <span
              style={{
                fontFamily: "var(--font-ibm-mono, monospace)",
                fontSize: "8px", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: statusInfo.color, background: statusInfo.bg,
                borderRadius: "3px", padding: "1px 5px", whiteSpace: "nowrap",
              }}
            >
              {statusInfo.text}
            </span>
          )}
        </div>

        {/* Equipa visitante */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <TeamMono name={away_team} size={28} logoUrl={teamLogos?.[away_team]} showLabel />
          <span
            style={{
              fontFamily: "var(--font-barlow-condensed, sans-serif)",
              fontWeight: awayWon ? 700 : 400,
              fontSize: "14px", letterSpacing: "0.02em", textTransform: "uppercase",
              color: awayWon ? "#1A1612" : homeWon ? "#8C837A" : "#1A1612",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {away_team}
          </span>
        </div>
      </div>

      {/* Linha secundária: pavilhão / localização */}
      {location && (
        <div
          style={{
            padding: "0 16px 8px 76px",
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "10px", letterSpacing: "0.06em",
            textTransform: "uppercase", color: "#8C837A", lineHeight: 1,
          }}
        >
          {location}
        </div>
      )}
    </div>
  );

  const href = isLive && game.live_game_url
    ? game.live_game_url
    : hasResult
    ? `/${competitionSlug}/jogo/${id}`
    : null;

  return href
    ? <Link href={href} style={{ display: "block", textDecoration: "none" }}>{inner}</Link>
    : inner;
}
