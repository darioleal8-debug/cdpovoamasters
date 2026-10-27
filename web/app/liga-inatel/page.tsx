import type { Metadata } from "next";
import Link from "next/link";
import { getCompetitionBySlug, getCompetitionGames, getStandingsBySeries, getLatestNoticias } from "@/lib/competitions-data";
import { createAdminClient } from "@/lib/supabase/server";
import { todayInClubTz } from "@/lib/time/club-time";
import { CourtBg } from "@/components/competitions/court-bg";
import { TeamMono } from "@/components/competitions/team-mono";
import { teamAbbr } from "@/lib/liga/format";
import { ScoreTicker } from "@/components/competitions/score-ticker";
import { ScoreCard } from "@/components/competitions/score-card";
import { SeriesStandingsTabs } from "@/components/competitions/series-standings-tabs";
import type { PublicGame } from "@/types/competitions";
import { NoticiasSection } from "@/components/liga/noticias-section";

export const metadata: Metadata = {
  title: "Liga INATEL",
  description: "Classificação, calendário e resultados da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

const PT_DAYS_FULL = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDay(s: string) {
  const d = new Date(s + "T12:00:00");
  return { wd: PT_DAYS_FULL[d.getDay()].slice(0,3).toUpperCase(), day: d.getDate(), mon: PT_MONTHS[d.getMonth()] };
}

/** Retorna "HOJE" / "AMANHÃ" quando aplicável, ou o label normal */
function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return "HOJE";
  if (dateStr === tomorrowStr) return "AMANHÃ";
  const { wd, day, mon } = fmtDay(dateStr);
  return `${wd} ${day} ${mon}`;
}

function teamAbbrTicker(name: string): string {
  return teamAbbr(name).slice(0, 2);
}

export default async function LigaInatelHomePage() {
  const competition = await getCompetitionBySlug("liga-inatel");

  if (!competition || !competition.season_id) {
    return (
      <div style={{ padding: "80px 20px", textAlign: "center", color: "#6F675F" }}>
        <p>Competição não disponível.</p>
      </div>
    );
  }

  // Datas de hoje e amanhã em hora de Lisboa
  const now = new Date();
  const todayStr    = todayInClubTz(now);
  const tomorrowDate = new Date(now.getTime() + 86_400_000);
  const tomorrowStr  = todayInClubTz(tomorrowDate);

  const supabase = await createAdminClient();

  const [games, standingsBySeries, noticias, seasonRes, teamsRes] = await Promise.all([
    getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id),
    getStandingsBySeries(competition.id),
    getLatestNoticias(4),
    supabase.from("seasons").select("name").eq("id", competition.season_id).single(),
    supabase.from("league_teams").select("name, logo_url").not("logo_url", "is", null),
  ]);

  const season = seasonRes.data;
  const logoMap = new Map<string, string | null>(
    (teamsRes.data ?? []).map((t) => [t.name, t.logo_url ?? null])
  );

  const approvedGames: PublicGame[] = games.filter((g) => g.result_status === "approved");
  const futureGames: PublicGame[] = games
    .filter((g) => new Date(g.event_date + "T23:59:59") >= now)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

  const nextGame = futureGames[0] ?? null;

  const maxResultJornada = approvedGames.length > 0
    ? Math.max(...approvedGames.map((g) => g.syntheticJornada))
    : 0;
  const lastJornadaResults = approvedGames.filter((g) => g.syntheticJornada === maxResultJornada);

  const gamesPlayed = approvedGames.length;
  const totalPts = approvedGames.reduce((s, g) => s + (g.result?.home_score ?? 0) + (g.result?.away_score ?? 0), 0);
  const avgPts = gamesPlayed > 0 ? (totalPts / (2 * gamesPlayed)).toFixed(1) : null;
  const maxJornada = games.length > 0 ? Math.max(...games.map((g) => g.syntheticJornada)) : 0;

  const tickerItems = approvedGames.map(
    (g) =>
      `J${g.syntheticJornada} · ${teamAbbrTicker(g.home_team)} ${g.result!.home_score}–${g.result!.away_score} ${teamAbbrTicker(g.away_team)}`
  );

  const nextFutureJornada = futureGames.length > 0
    ? Math.min(...futureGames.map((g) => g.syntheticJornada).filter(Boolean))
    : null;
  const nextJornadaGames = nextFutureJornada
    ? futureGames.filter((g) => g.syntheticJornada === nextFutureJornada)
    : [];

  const maxW = { maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" };

  return (
    <div>
      {/* ── HERO ── */}
      <CourtBg minHeight="340px">
        <div style={{ ...maxW, padding: "40px 20px" }}>
          <div className="liga-hero-grid">
            {/* Esquerda: título + stats */}
            <div>
              <p
                style={{
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#F97316",
                  marginBottom: "12px",
                }}
              >
                LIGA INATEL · {season?.name ?? "ÉPOCA 2024/25"}
              </p>

              <h1
                style={{
                  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                  fontWeight: 800,
                  fontSize: "clamp(40px, 10vw, 120px)",
                  lineHeight: 0.88,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#F6F2EC",
                  margin: "0 0 24px",
                  textWrap: "balance",
                }}
              >
                LIGA /
                <br />
                INATEL /{" "}
                <span style={{ color: "#F97316" }}>MASTERS</span>
              </h1>

              {/* Stats — 3 colunas em mobile */}
              <div className="liga-stats-row">
                {gamesPlayed > 0 ? (
                  <>
                    <Stat label="Jornada"         value={maxResultJornada > 0 ? `${maxResultJornada}/${maxJornada || "—"}` : "—"} />
                    <Stat label="Jogos disputados" value={String(gamesPlayed)} />
                    {avgPts && <Stat label="Pts / jogo" value={avgPts} />}
                  </>
                ) : (
                  <>
                    {nextGame && (
                      <Stat
                        label="Arranque"
                        value={`${fmtDay(nextGame.event_date).day} ${fmtDay(nextGame.event_date).mon}`}
                      />
                    )}
                    {maxJornada > 0 && <Stat label="Jornadas" value={String(maxJornada)} />}
                    {games.length > 0 && (
                      <Stat
                        label="Equipas"
                        value={String(
                          new Set([...games.map((g) => g.home_team), ...games.map((g) => g.away_team)]).size
                        )}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Próximo jogo card */}
            {nextGame && (
              <div className="liga-next-card">
                <div
                  style={{
                    background: "#F97316",
                    padding: "8px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-ibm-mono, monospace)",
                      fontSize: "10px",
                      fontWeight: 500,
                      letterSpacing: "0.1em",
                      color: "#15110E",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    PRÓXIMO JOGO{nextGame.syntheticJornada ? ` · J${nextGame.syntheticJornada}` : ""}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ibm-mono, monospace)",
                      fontSize: "10px",
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      color: "#7A3400",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dayLabel(nextGame.event_date, todayStr, tomorrowStr)}
                    {nextGame.event_time ? ` · ${nextGame.event_time.slice(0, 5)}` : ""}
                  </span>
                </div>

                <div style={{ padding: "16px 14px 12px" }}>
                  {[{ name: nextGame.home_team }, { name: nextGame.away_team }].map((t, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: i === 0 ? "0 0 10px" : "10px 0 0",
                        borderBottom: i === 0 ? "1px solid rgba(249,115,22,.2)" : undefined,
                      }}
                    >
                      <TeamMono name={t.name} size={40} logoUrl={logoMap.get(t.name) ?? null} />
                      <span className="liga-next-team-name">
                        {t.name}
                      </span>
                      {i === 0 && (
                        <span
                          style={{
                            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                            fontWeight: 800,
                            fontSize: "13px",
                            letterSpacing: "0.08em",
                            color: "#F97316",
                            flexShrink: 0,
                          }}
                        >
                          VS
                        </span>
                      )}
                    </div>
                  ))}

                  {nextGame.location && (
                    <p className="liga-card-location" style={{ marginTop: "10px" }}>
                      {nextGame.location}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CourtBg>

      {/* ── TICKER ── */}
      <ScoreTicker items={tickerItems} />

      {/* ── NOTÍCIAS ── */}
      <NoticiasSection noticias={noticias} />

      {/* ── ÚLTIMOS RESULTADOS ── */}
      {lastJornadaResults.length > 0 && (
        <section style={{ ...maxW, padding: "48px 20px 0" }}>
          <SectionTitle
            title="Últimos resultados"
            suffix={maxResultJornada > 0 ? `J${maxResultJornada}` : undefined}
            href="/liga-inatel/resultados"
            linkLabel="Ver todos →"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            {lastJornadaResults.map((g) => (
              <ScoreCard
                key={g.id}
                game={g}
                homeLogo={logoMap.get(g.home_team) ?? null}
                awayLogo={logoMap.get(g.away_team) ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── CLASSIFICAÇÃO + PRÓXIMA JORNADA ── */}
      <section style={{ ...maxW, padding: "48px 20px" }}>
        <div className="liga-section-grid">
          {/* Classificação resumida */}
          <div>
            <SectionTitle
              title="Classificação"
              href="/liga-inatel/classificacao"
              linkLabel="Ver completa →"
            />
            <div
              style={{
                background: "#FFFDFA",
                borderRadius: "8px",
                boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
                overflow: "hidden",
                marginTop: "16px",
              }}
            >
              <SeriesStandingsTabs groups={standingsBySeries} limit={6} mini />
            </div>
          </div>

          {/* Próxima jornada */}
          {nextJornadaGames.length > 0 && (
            <div>
              <SectionTitle
                title="Próxima jornada"
                suffix={nextFutureJornada ? `J${nextFutureJornada}` : undefined}
                href="/liga-inatel/calendario"
                linkLabel="Calendário →"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
                {nextJornadaGames.map((g) => {
                  const { day, mon } = fmtDay(g.event_date);
                  const label = dayLabel(g.event_date, todayStr, tomorrowStr);
                  const isSpecial = label === "HOJE" || label === "AMANHÃ";
                  return (
                    <div
                      key={g.id}
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "stretch",
                        background: "#FFFDFA",
                        borderRadius: "8px",
                        boxShadow: "0 1px 0 rgba(26,22,18,.06), 0 4px 12px -6px rgba(26,22,18,.15)",
                        overflow: "hidden",
                      }}
                    >
                      {/* Bloco de data */}
                      <div
                        style={{
                          background: "#1A1612",
                          padding: "12px 14px",
                          textAlign: "center",
                          flexShrink: 0,
                          minWidth: "58px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "2px",
                        }}
                      >
                        {isSpecial ? (
                          <div
                            style={{
                              fontFamily: "var(--font-ibm-mono, monospace)",
                              fontSize: "9px",
                              fontWeight: 500,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              color: "#F97316",
                              lineHeight: 1,
                            }}
                          >
                            {label}
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                fontFamily: "var(--font-ibm-mono, monospace)",
                                fontSize: "9px",
                                fontWeight: 500,
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                color: "#F97316",
                                lineHeight: 1.3,
                              }}
                            >
                              {label.split(" ")[0]}
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                                fontWeight: 700,
                                fontSize: "28px",
                                color: "#F6F2EC",
                                lineHeight: 1,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {day}
                            </div>
                          </>
                        )}
                        {g.event_time ? (
                          <div
                            style={{
                              fontFamily: "var(--font-ibm-mono, monospace)",
                              fontSize: "9px",
                              fontWeight: 500,
                              color: "#B9AFA4",
                              letterSpacing: "0.05em",
                              lineHeight: 1.3,
                            }}
                          >
                            {g.event_time.slice(0, 5)}
                          </div>
                        ) : (
                          !isSpecial && (
                            <div
                              style={{
                                fontFamily: "var(--font-ibm-mono, monospace)",
                                fontSize: "9px",
                                color: "#6F675F",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                              }}
                            >
                              {mon}
                            </div>
                          )
                        )}
                      </div>

                      {/* Equipas + pavilhão */}
                      <div style={{ padding: "12px 12px 12px 0", flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "var(--font-barlow-condensed, sans-serif)",
                            fontWeight: 600,
                            fontSize: "14px",
                            letterSpacing: "0.03em",
                            textTransform: "uppercase",
                            color: "#1A1612",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.home_team}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-barlow, sans-serif)",
                            fontSize: "12px",
                            color: "#6F675F",
                            marginTop: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          vs {g.away_team}
                        </div>
                        {g.location && (
                          <div className="liga-row-location">
                            {g.location}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-ibm-mono, monospace)",
          fontSize: "10px",
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#B9AFA4",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div className="liga-stat-value">{value}</div>
    </div>
  );
}

function SectionTitle({
  title,
  suffix,
  href,
  linkLabel,
}: {
  title: string;
  suffix?: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "12px",
        paddingBottom: "10px",
        borderBottom: "3px solid #1A1612",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
          fontWeight: 800,
          fontSize: "clamp(22px, 4vw, 30px)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "#1A1612",
          lineHeight: 1,
        }}
      >
        {title}
        {suffix && (
          <span style={{ color: "#F97316", marginLeft: "8px" }}>· {suffix}</span>
        )}
      </span>
      <Link
        href={href}
        style={{
          fontFamily: "var(--font-barlow-condensed, sans-serif)",
          fontWeight: 600,
          fontSize: "13px",
          letterSpacing: "0.04em",
          color: "#C2530A",
          textDecoration: "none",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {linkLabel}
      </Link>
    </div>
  );
}
