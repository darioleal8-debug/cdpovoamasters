"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TeamMono } from "@/components/competitions/team-mono";
import { LiveBadge } from "@/components/competitions/live-badge";

/**
 * Cartão do hero da Liga INATEL com TODOS os jogos do dia.
 *
 * Jogos de equipas com conta HoopHub (CD Póvoa) têm estatísticas registadas
 * em tempo real (game_sessions / player_game_stats / play_by_play). Para
 * esses, o cartão lê a sessão ao vivo no browser e subscreve as alterações
 * via Supabase Realtime: o resultado atualiza sozinho e há ligação direta
 * para o acompanhamento ao vivo (/live/[sessionId]).
 *
 * Nota: em game_sessions, home_score é SEMPRE o CD Póvoa e away_score o
 * adversário — `ourSide` indica de que lado o CD Póvoa joga na liga.
 */

export interface TodayGame {
  id: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  home_team: string;
  away_team: string;
  homeLogo: string | null;
  awayLogo: string | null;
  jornada: number | null;
  /** resultado oficial já aprovado */
  result: { home_score: number; away_score: number } | null;
  /** lado do CD Póvoa neste jogo; null se não for jogo de equipa HoopHub */
  ourSide: "home" | "away" | null;
}

type LiveSession = {
  id: string;
  event_id: string;
  status: "scheduled" | "live" | "finished" | string;
  current_period: number | null;
  home_score: number;
  away_score: number;
};

const MONO = "var(--font-ibm-mono, monospace)";
const HEAVY = "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))";

export function TodayGamesCard({ games }: { games: TodayGame[] }) {
  const trackedIds = useMemo(
    () => games.filter((g) => g.ourSide && !g.result).map((g) => g.id),
    [games]
  );
  const [sessions, setSessions] = useState<Record<string, LiveSession>>({});

  useEffect(() => {
    if (trackedIds.length === 0) return;
    const supabase = createClient();
    let alive = true;

    const load = async () => {
      const { data } = await supabase
        .from("game_sessions")
        .select("id, event_id, status, current_period, home_score, away_score")
        .in("event_id", trackedIds);
      if (!alive || !data) return;
      setSessions((prev) => {
        const next = { ...prev };
        for (const s of data as LiveSession[]) next[s.event_id] = s;
        return next;
      });
    };
    load();

    const channel = supabase
      .channel(`liga-today-${trackedIds.join("-").slice(0, 60)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `event_id=in.(${trackedIds.join(",")})`,
        },
        (payload) => {
          const s = payload.new as LiveSession | undefined;
          if (s?.event_id) setSessions((prev) => ({ ...prev, [s.event_id]: s }));
        }
      )
      .subscribe();

    // Rede de segurança caso o websocket caia (ex.: telemóvel em segundo plano)
    const poll = window.setInterval(load, 8_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [trackedIds]);

  return (
    <div className="liga-next-card liga-today-card">
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
            fontFamily: MONO,
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.1em",
            color: "#15110E",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {games.length === 1 ? "JOGO DE HOJE" : `JOGOS DE HOJE · ${games.length}`}
        </span>
        <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.06em", color: "#7A3400" }}>
          HOJE
        </span>
      </div>

      <div>
        {games.map((g, i) => (
          <TodayGameRow key={g.id} game={g} session={sessions[g.id] ?? null} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

function TodayGameRow({ game: g, session, first }: { game: TodayGame; session: LiveSession | null; first: boolean }) {
  const isLiveSession = session?.status === "live";
  const isFinishedSession = session?.status === "finished";

  // Resultado a mostrar: oficial > sessão ao vivo (orientada home/away da liga)
  let score: { home: number; away: number } | null = null;
  if (g.result) score = { home: g.result.home_score, away: g.result.away_score };
  else if (session && g.ourSide && (isLiveSession || isFinishedSession)) {
    score = g.ourSide === "home"
      ? { home: session.home_score, away: session.away_score }
      : { home: session.away_score, away: session.home_score };
  }

  const statusLabel = g.result
    ? "FINAL"
    : isLiveSession
      ? `AO VIVO${session?.current_period ? ` · ${session.current_period}º P` : ""}`
      : isFinishedSession
        ? "TERMINADO"
        : g.event_time
          ? g.event_time.slice(0, 5)
          : "—";

  return (
    <div
      style={{
        padding: "12px 14px",
        borderTop: first ? undefined : "1px solid rgba(249,115,22,.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: isLiveSession ? "#F87171" : "#F97316",
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel}
          {g.jornada ? <span style={{ color: "#8C837A" }}>{` · J${g.jornada}`}</span> : null}
        </span>
        {!isLiveSession && !g.result && !isFinishedSession && (
          <LiveBadge date={g.event_date} time={g.event_time} />
        )}
        {isLiveSession && <LivePill />}
      </div>

      {[
        { name: g.home_team, logo: g.homeLogo, pts: score?.home },
        { name: g.away_team, logo: g.awayLogo, pts: score?.away },
      ].map((t, idx) => {
        const winning =
          score && (idx === 0 ? score.home > score.away : score.away > score.home);
        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "3px 0" }}>
            <TeamMono name={t.name} size={30} logoUrl={t.logo} />
            <span className="liga-next-team-name" style={{ opacity: score && !winning ? 0.7 : 1 }}>
              {t.name}
            </span>
            {score && (
              <span
                style={{
                  fontFamily: HEAVY,
                  fontWeight: 800,
                  fontSize: "22px",
                  lineHeight: 1,
                  color: winning ? "#F97316" : "#F6F2EC",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {t.pts}
              </span>
            )}
          </div>
        );
      })}

      {g.location && (
        <p className="liga-card-location" style={{ marginTop: "6px" }}>{g.location}</p>
      )}

      {/* Equipa com conta HoopHub: acompanhamento ao vivo */}
      {g.ourSide && !g.result && (
        session ? (
          <Link
            href={`/live/${session.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginTop: "10px",
              padding: "8px 10px",
              borderRadius: "6px",
              background: isLiveSession ? "#DC2626" : "#F97316",
              color: isLiveSession ? "#FFFFFF" : "#15110E",
              fontFamily: "var(--font-barlow-condensed, sans-serif)",
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            {isLiveSession
              ? "Acompanhar ao vivo · resultado e estatísticas →"
              : isFinishedSession
                ? "Ver estatísticas do jogo →"
                : "Abrir acompanhamento ao vivo →"}
          </Link>
        ) : (
          <p
            style={{
              marginTop: "10px",
              fontFamily: MONO,
              fontSize: "9.5px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#B9AFA4",
              lineHeight: 1.4,
            }}
          >
            ● Resultado e estatísticas em direto no HoopHub quando o jogo começar
          </p>
        )
      )}
    </div>
  );
}

function LivePill() {
  return (
    <span
      className="live-badge"
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: "#DC2626",
        color: "#FFFFFF",
        borderRadius: "4px",
        padding: "3px 7px",
        fontFamily: MONO,
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        lineHeight: 1,
      }}
    >
      <span className="live-badge-dot" aria-hidden="true" />
      LIVE
    </span>
  );
}
