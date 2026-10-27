import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";
import { CourtBg } from "@/components/competitions/court-bg";
import { TeamMono } from "@/components/competitions/team-mono";
import { PlayerStatsTabs } from "@/components/competitions/player-stats-tabs";

export const revalidate = 60;

const MONTH_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const WEEKDAY_PT = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
const MONTH_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDateLong(s: string) {
  const d = new Date(s + "T12:00:00");
  return `${WEEKDAY_PT[d.getDay()]}, ${d.getDate()} de ${MONTH_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

function fmtDateShort(s: string) {
  const d = new Date(s + "T12:00:00");
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

type GamePeriod = { periodo: number; home_points: number; away_points: number };
type PlayerStat = { nome: string; side: "home" | "away"; numero: number | null; pontos: number; triplos: number; lances_livres: number; faltas: number };

async function getGamePageData(eventId: string) {
  const supabase = await createAdminClient();

  const [eventRes, resultRes, periodsRes, playerStatsRes] = await Promise.all([
    supabase.from("events")
      .select("id, event_date, event_time, location, description, season_id, competition")
      .eq("id", eventId).eq("type", "jogo").is("deleted_at", null).single(),
    supabase.from("league_game_results")
      .select("*") // inclui pontos por atribuir (migração 111), quando existirem
      .eq("event_id", eventId).maybeSingle(),
    supabase.from("league_game_periods")
      .select("periodo, home_points, away_points").eq("event_id", eventId).order("periodo"),
    supabase.from("league_game_player_stats")
      .select("nome, side, numero, pontos, triplos, lances_livres, faltas")
      .eq("event_id", eventId).order("pontos", { ascending: false }),
  ]);

  const event = eventRes.data;
  if (!event) return null;

  const meta = parseGameMeta(event.description ?? null);
  if (meta?.is_test === true) return null;

  const result = resultRes.data ?? null;

  // Logos das equipas
  let homeLogoUrl: string | null = null;
  let awayLogoUrl: string | null = null;
  if (result?.home_team_id || result?.away_team_id) {
    const ids = [result?.home_team_id, result?.away_team_id].filter(Boolean) as string[];
    const { data: teams } = await supabase.from("league_teams").select("id, logo_url").in("id", ids);
    homeLogoUrl = teams?.find((t) => t.id === result?.home_team_id)?.logo_url ?? null;
    awayLogoUrl = teams?.find((t) => t.id === result?.away_team_id)?.logo_url ?? null;
  }

  // Notícias associadas (máx. 2)
  const { data: news } = await supabase.from("news")
    .select("id, slug, title, excerpt, cover_image_url, published_at")
    .eq("game_id", eventId).eq("is_published", true)
    .order("published_at", { ascending: false }).limit(2);

  // Fotos (hidden=false via RLS, máx. 6)
  const { data: photosRaw } = await supabase.from("game_photos")
    .select("id, storage_path, caption, sort_order")
    .eq("game_id", eventId).order("sort_order").limit(6);

  const photos = (photosRaw ?? []).map((p) => ({
    id: p.id,
    caption: p.caption as string | null,
    public_url: supabase.storage.from("game-photos").getPublicUrl(p.storage_path).data.publicUrl,
  }));

  // Navegação prev/next
  let prevGame: { id: string; event_date: string; home_team?: string; away_team?: string } | null = null;
  let nextGame: { id: string; event_date: string; home_team?: string; away_team?: string } | null = null;
  if (event.competition && event.season_id) {
    const [prevRes, nextRes] = await Promise.all([
      supabase.from("events").select("id, event_date, description")
        .eq("type", "jogo").eq("competition", event.competition).eq("season_id", event.season_id)
        .is("deleted_at", null).lt("event_date", event.event_date)
        .order("event_date", { ascending: false }).limit(1),
      supabase.from("events").select("id, event_date, description")
        .eq("type", "jogo").eq("competition", event.competition).eq("season_id", event.season_id)
        .is("deleted_at", null).gt("event_date", event.event_date)
        .order("event_date", { ascending: true }).limit(1),
    ]);
    const prev = prevRes.data?.[0];
    if (prev) {
      const m = parseGameMeta(prev.description);
      prevGame = { id: prev.id, event_date: prev.event_date, home_team: m?.home_team, away_team: m?.away_team };
    }
    const next = nextRes.data?.[0];
    if (next) {
      const m = parseGameMeta(next.description);
      nextGame = { id: next.id, event_date: next.event_date, home_team: m?.home_team, away_team: m?.away_team };
    }
  }

  return {
    event,
    meta,
    result,
    periods: (periodsRes.data ?? []) as GamePeriod[],
    playerStats: (playerStatsRes.data ?? []) as PlayerStat[],
    homeLogoUrl,
    awayLogoUrl,
    news: news ?? [],
    photos,
    prevGame,
    nextGame,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const data = await getGamePageData(eventId);
  if (!data) return { title: "Jogo — Liga INATEL" };
  const home = data.meta?.home_team ?? data.result?.home_team_name ?? "Equipa A";
  const away = data.meta?.away_team ?? data.result?.away_team_name ?? "Adversário";
  const score = data.result ? ` ${data.result.home_score}–${data.result.away_score}` : "";
  return {
    title: `${home} vs ${away}${score}`,
    description: `Relatório do jogo ${home} vs ${away} — Liga INATEL.`,
  };
}

const SECTION: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--border, #E9E2D8)",
  background: "var(--card, #FFFDFA)",
  padding: "20px",
};

export default async function GameDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const data = await getGamePageData(eventId);
  if (!data) notFound();

  const { event, meta, result, periods, playerStats, homeLogoUrl, awayLogoUrl, news, photos, prevGame, nextGame } = data;

  const homeTeam = meta?.home_team ?? result?.home_team_name ?? "—";
  const awayTeam = meta?.away_team ?? result?.away_team_name ?? "—";
  const hasResult = !!result;
  const homeWon = hasResult && result!.home_score > result!.away_score;
  const awayWon = hasResult && result!.away_score > result!.home_score;
  // Boletins importados guardam o prolongamento como período 5+; os antigos só têm a flag
  const overtime = result?.overtime === true && !periods.some((p) => p.periodo > 4);

  const jornada = meta?.jornada;
  const serie = meta?.serie;
  const dateLabel = fmtDateLong(event.event_date);
  const pavilion = meta?.pavilion;
  const locality = meta?.locality;
  const locationText = event.location ?? pavilion ?? locality ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Breadcrumb */}
      <div>
        <Link href="/liga-inatel/calendario" style={{ fontSize: "12px", color: "var(--muted-foreground, #8C837A)", textDecoration: "none" }}>
          ← Calendário
        </Link>
      </div>

      {/* ── HERO ── */}
      <CourtBg style={{ borderRadius: "16px" }} minHeight="200px">
        <div style={{ position: "relative", zIndex: 1, padding: "24px 20px 20px" }}>

          {/* Jornada/série badge */}
          {(jornada || serie) && (
            <p style={{
              textAlign: "center",
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#F97316",
              fontWeight: 500,
              marginBottom: "16px",
            }}>
              Liga INATEL{serie ? ` · Série ${serie}` : ""}{jornada ? ` · J${jornada}` : ""}
            </p>
          )}

          {/* Equipas + marcador */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>

            {/* Casa */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flex: "1 1 120px", minWidth: 0 }}>
              <TeamMono name={homeTeam} size={52} logoUrl={homeLogoUrl} showLabel />
              <span style={{
                fontFamily: "var(--font-barlow-condensed, sans-serif)",
                fontWeight: 700,
                fontSize: "13px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: hasResult ? (homeWon ? "#FFFDFA" : "#B9AFA4") : "#FFFDFA",
                textAlign: "center",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "140px",
              }}>
                {homeTeam}
              </span>
            </div>

            {/* Marcador */}
            <div style={{ textAlign: "center", flexShrink: 0, minWidth: "100px" }}>
              {hasResult ? (
                <div>
                  <div style={{
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 800,
                    fontSize: "clamp(44px, 8vw, 72px)",
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                    color: "#FFFDFA",
                  }}>
                    <span style={{ color: homeWon ? "#FFFDFA" : "#B9AFA4" }}>{result!.home_score}</span>
                    <span style={{ color: "#8C6040", margin: "0 6px" }}>–</span>
                    <span style={{ color: awayWon ? "#FFFDFA" : "#B9AFA4" }}>{result!.away_score}</span>
                  </div>
                  <div style={{ marginTop: "6px", display: "flex", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", letterSpacing: "0.1em", color: "#F97316", fontWeight: 600 }}>
                      FINAL
                    </span>
                    {overtime && (
                      <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", letterSpacing: "0.1em", color: "#F97316", fontWeight: 600 }}>
                        · PROL.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "20px", color: "#8C6040", letterSpacing: "0.1em" }}>vs</span>
              )}
            </div>

            {/* Visitante */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flex: "1 1 120px", minWidth: 0 }}>
              <TeamMono name={awayTeam} size={52} logoUrl={awayLogoUrl} showLabel />
              <span style={{
                fontFamily: "var(--font-barlow-condensed, sans-serif)",
                fontWeight: 700,
                fontSize: "13px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: hasResult ? (awayWon ? "#FFFDFA" : "#B9AFA4") : "#FFFDFA",
                textAlign: "center",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "140px",
              }}>
                {awayTeam}
              </span>
            </div>
          </div>

          {/* Data + local */}
          <div style={{
            marginTop: "20px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "4px 16px",
          }}>
            <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", color: "#B9AFA4", letterSpacing: "0.06em", textTransform: "capitalize" }}>
              {dateLabel}{event.event_time ? ` · ${event.event_time.slice(0, 5)}` : ""}
            </span>
            {locationText && (
              <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", color: "#8C6040", letterSpacing: "0.04em" }}>
                {locationText}
              </span>
            )}
          </div>
        </div>
      </CourtBg>

      {/* ── PARCIAIS ── */}
      {periods.length > 0 && (
        <section style={SECTION}>
          <h2 style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground, #8C837A)", marginBottom: "14px", fontWeight: 600 }}>
            Parciais
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 8px 6px 0", textAlign: "left", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground, #8C837A)", fontWeight: 600, borderBottom: "1px solid var(--border, #E9E2D8)" }}>
                    Equipa
                  </th>
                  {periods.map((p) => (
                    <th key={p.periodo} style={{ padding: "6px 10px", textAlign: "center", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", letterSpacing: "0.08em", color: "var(--muted-foreground, #8C837A)", fontWeight: 600, borderBottom: "1px solid var(--border, #E9E2D8)" }}>
                      {p.periodo > 4 ? `PR${p.periodo > 5 ? p.periodo - 4 : ""}` : `Q${p.periodo}`}
                    </th>
                  ))}
                  {overtime && (
                    <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", letterSpacing: "0.08em", color: "#F97316", fontWeight: 600, borderBottom: "1px solid var(--border, #E9E2D8)" }}>
                      PR
                    </th>
                  )}
                  <th style={{ padding: "6px 8px", textAlign: "center", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", letterSpacing: "0.08em", color: "var(--muted-foreground, #8C837A)", fontWeight: 600, borderBottom: "1px solid var(--border, #E9E2D8)" }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {(["home", "away"] as const).map((side) => {
                  const name = side === "home" ? homeTeam : awayTeam;
                  const total = side === "home" ? result?.home_score : result?.away_score;
                  const won = side === "home" ? homeWon : awayWon;
                  return (
                    <tr key={side}>
                      <td style={{ padding: "8px 8px 8px 0", fontFamily: "var(--font-barlow-condensed, sans-serif)", fontSize: "13px", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: won ? "var(--foreground, #1A1612)" : "var(--muted-foreground, #8C837A)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                        {name}
                      </td>
                      {periods.map((p) => {
                        const pts = side === "home" ? p.home_points : p.away_points;
                        return (
                          <td key={p.periodo} style={{ padding: "8px 10px", textAlign: "center", fontSize: "14px", fontWeight: pts > 0 ? 600 : 400, color: pts > 0 ? "var(--foreground, #1A1612)" : "var(--muted-foreground, #8C837A)" }}>
                            {pts}
                          </td>
                        );
                      })}
                      {overtime && (
                        <td style={{ padding: "8px 10px", textAlign: "center", fontSize: "14px", color: "var(--muted-foreground, #8C837A)" }}>—</td>
                      )}
                      <td style={{ padding: "8px", textAlign: "center", fontSize: "16px", fontWeight: 800, color: won ? "var(--foreground, #1A1612)" : "var(--muted-foreground, #8C837A)" }}>
                        {total ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Árbitros */}
          {(result?.referees as string[] | null)?.length ? (
            <p style={{ marginTop: "14px", fontSize: "12px", color: "var(--muted-foreground, #8C837A)", fontFamily: "var(--font-ibm-mono, monospace)" }}>
              <span style={{ fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginRight: "6px" }}>Árbitros</span>
              {(result?.referees as string[]).join(", ")}
            </p>
          ) : null}
        </section>
      )}

      {/* ── ESTATÍSTICAS DE JOGADORES ── */}
      {playerStats.length > 0 && (
        <section style={SECTION}>
          <h2 style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground, #8C837A)", marginBottom: "14px", fontWeight: 600 }}>
            Estatísticas
          </h2>
          <PlayerStatsTabs
            homeName={homeTeam}
            awayName={awayTeam}
            stats={playerStats}
          />
          {(() => {
            const r = result as { home_unattributed_points?: number | null; away_unattributed_points?: number | null } | null;
            const parts = [
              r?.home_unattributed_points ? `${homeTeam}: ${r.home_unattributed_points}` : null,
              r?.away_unattributed_points ? `${awayTeam}: ${r.away_unattributed_points}` : null,
            ].filter(Boolean);
            return parts.length ? (
              <p style={{ fontSize: "11px", color: "var(--muted-foreground, #8C837A)", margin: "10px 0 0" }}>
                Pontos sem marcador identificado no boletim — {parts.join(" · ")}.
              </p>
            ) : null;
          })()}
        </section>
      )}

      {/* ── NOTÍCIAS RELACIONADAS ── */}
      {news.length > 0 && (
        <section style={SECTION}>
          <h2 style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground, #8C837A)", marginBottom: "14px", fontWeight: 600 }}>
            Destaques
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {news.map((n) => (
              <Link key={n.id} href={`/liga-inatel/noticias/${n.slug}`} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "10px", borderRadius: "8px", border: "1px solid var(--border, #E9E2D8)", transition: "background 0.15s" }}>
                  {n.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.cover_image_url}
                      alt={n.title}
                      width={72}
                      height={48}
                      style={{ borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: "var(--font-barlow-condensed, sans-serif)", fontWeight: 700, fontSize: "14px", letterSpacing: "0.02em", color: "var(--foreground, #1A1612)", lineHeight: 1.3, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {n.title}
                    </p>
                    {n.excerpt && (
                      <p style={{ fontSize: "12px", color: "var(--muted-foreground, #8C837A)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                        {n.excerpt}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── FOTOS ── */}
      {photos.length > 0 && (
        <section style={SECTION}>
          <h2 style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground, #8C837A)", marginBottom: "14px", fontWeight: 600 }}>
            Fotos
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px" }}>
            {photos.map((p) => (
              <div key={p.id} style={{ aspectRatio: "4/3", borderRadius: "8px", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.public_url}
                  alt={p.caption ?? "Foto do jogo"}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── NAVEGAÇÃO PREV/NEXT ── */}
      {(prevGame || nextGame) && (
        <nav style={{ display: "flex", justifyContent: "space-between", gap: "8px", paddingTop: "4px" }}>
          {prevGame ? (
            <Link href={`/liga-inatel/jogo/${prevGame.id}`} style={{ textDecoration: "none", flex: 1 }}>
              <div style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border, #E9E2D8)", background: "var(--card, #FFFDFA)" }}>
                <p style={{ fontSize: "10px", fontFamily: "var(--font-ibm-mono, monospace)", color: "var(--muted-foreground, #8C837A)", letterSpacing: "0.08em", marginBottom: "3px" }}>
                  ← ANTERIOR
                </p>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--foreground, #1A1612)", lineHeight: 1.3 }}>
                  {prevGame.home_team && prevGame.away_team
                    ? `${prevGame.home_team} vs ${prevGame.away_team}`
                    : fmtDateShort(prevGame.event_date)}
                </p>
              </div>
            </Link>
          ) : <div style={{ flex: 1 }} />}

          {nextGame ? (
            <Link href={`/liga-inatel/jogo/${nextGame.id}`} style={{ textDecoration: "none", flex: 1 }}>
              <div style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border, #E9E2D8)", background: "var(--card, #FFFDFA)", textAlign: "right" }}>
                <p style={{ fontSize: "10px", fontFamily: "var(--font-ibm-mono, monospace)", color: "var(--muted-foreground, #8C837A)", letterSpacing: "0.08em", marginBottom: "3px" }}>
                  SEGUINTE →
                </p>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--foreground, #1A1612)", lineHeight: 1.3 }}>
                  {nextGame.home_team && nextGame.away_team
                    ? `${nextGame.home_team} vs ${nextGame.away_team}`
                    : fmtDateShort(nextGame.event_date)}
                </p>
              </div>
            </Link>
          ) : <div style={{ flex: 1 }} />}
        </nav>
      )}

    </div>
  );
}
