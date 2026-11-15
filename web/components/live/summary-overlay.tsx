"use client";

import type { GameSession, PlayByPlay } from "@/types/database";
import { ClubName } from "@/lib/club-context";
import type { PlayerWithUser } from "@/types/database";
import { deriveStats, efficiency, totalAwayFouls } from "@/lib/live/derive-stats";
import { formatMinutes } from "@/lib/live/minutes";
import { formatClock } from "@/hooks/use-live-game";
import { MONO, SANS } from "./tokens";
import { useState } from "react";
import { ShotReport } from "./shot-report";

interface Analysis {
  headline?: string; what_happened?: string[]; strengths?: string[]; concerns?: string[];
  suggestions?: string[]; player_notes?: Array<{ player: string; note: string }>; conclusion?: string;
}

/** AI coach analysis (DeepSeek) built from every stat logged so far. */
function AiAnalysis({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ analysis: Analysis; generatedAt: string } | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/deepseek/live-analysis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      setData(j);
    } catch (e) {
      setError((e as Error).message || "Could not generate the analysis");
    } finally {
      setLoading(false);
    }
  }

  const list = (title: string, items?: string[]) =>
    items && items.length > 0 ? (
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3, fontSize: 14, color: "var(--text)" }}>
          {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>
    ) : null;

  const a = data?.analysis;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={run} disabled={loading}
          style={{
            height: 44, padding: "0 18px", borderRadius: 10, border: "none", cursor: loading ? "wait" : "pointer",
            background: "var(--accent)", color: "var(--accentInk)", fontFamily: SANS, fontSize: 14, fontWeight: 700,
          }}
        >
          {loading ? "Analysing…" : a ? "↻ Refresh analysis" : "✦ Generate AI analysis"}
        </button>
        {data && <span style={{ fontSize: 12, color: "var(--muted)" }}>Based on all stats up to {new Date(data.generatedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
      {a && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" }}>
          {a.headline && <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{a.headline}</div>}
          {list("What happened", a.what_happened)}
          {list("Strengths", a.strengths)}
          {list("Concerns", a.concerns)}
          {list("Suggestions", a.suggestions)}
          {a.player_notes && a.player_notes.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Players</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 14, color: "var(--text)" }}>
                {a.player_notes.map((n, i) => <div key={i}><b>{n.player}</b> — {n.note}</div>)}
              </div>
            </div>
          )}
          {a.conclusion && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{a.conclusion}</div>}
        </div>
      )}
    </div>
  );
}

interface SummaryOverlayProps {
  session: GameSession;
  roster: PlayerWithUser[];
  onCourtIds: string[];
  plays: PlayByPlay[];
  clockSecs: number;
  /** tempo jogado (segundos) por jogador */
  secsById?: Map<string, number>;
  tokens: React.CSSProperties;
  onClose: () => void;
  onExport?: () => void;
}

const COL = "200px 64px 64px 84px 84px 84px 110px 64px 64px 64px 64px 70px 108px 64px";

function fmt(made: number, att: number) { return `${made}/${att}`; }

export function SummaryOverlay({
  session, roster, onCourtIds, plays, clockSecs, secsById, tokens, onClose, onExport,
}: SummaryOverlayProps) {
  const [chartPlayer, setChartPlayer] = useState<string>("all");
  const opponent = session.opponent_name?.trim() || "Opponent";
  const awayFoulsGame = totalAwayFouls(plays as never);
  const { playerMap, awayRebOff, awayRebDef } = deriveStats(plays, session.current_period);

  // Ordered: on-court first, then bench
  const orderedRoster = [
    ...roster.filter((p) => onCourtIds.includes(p.user_id)),
    ...roster.filter((p) => !onCourtIds.includes(p.user_id)),
  ];

  // Totals
  let totPts = 0, totFg2m = 0, totFg2a = 0, totFg3m = 0, totFg3a = 0;
  let totFtm = 0, totFta = 0, totRo = 0, totRd = 0;
  let totAst = 0, totStl = 0, totBlk = 0, totTov = 0;
  let totFd = 0, totFo = 0, totFt = 0, totFa = 0, totFf = 0, totEff = 0;
  for (const s of playerMap.values()) {
    totPts += s.pts; totFg2m += s.fg2_made; totFg2a += s.fg2_att;
    totFg3m += s.fg3_made; totFg3a += s.fg3_att;
    totFtm += s.ft_made; totFta += s.ft_att;
    totRo += s.reb_off; totRd += s.reb_def;
    totAst += s.ast; totStl += s.stl; totBlk += s.blk; totTov += s.tov;
    totFd += s.fouls_def; totFo += s.fouls_of; totFt += s.fouls_tec; totFa += s.fouls_anti;
    totFf += s.fouls_total;
    totEff += efficiency(s);
  }

  const headerCell: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
    color: "var(--muted)", textTransform: "uppercase",
    textAlign: "center", fontFamily: SANS,
  };

  const numCell: React.CSSProperties = {
    fontFamily: MONO, fontSize: 14, color: "var(--text)", textAlign: "right",
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        ...tokens,
        position: "fixed", inset: 0, zIndex: 9999,
        background: "oklch(0.2 0.02 250 / 0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: 28, overflow: "auto", fontFamily: SANS,
      } as React.CSSProperties}
    >
      <div style={{
        width: "100%", maxWidth: 1280,
        background: "var(--bg)", borderRadius: 20, padding: 20,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>
              Stats summary · Period {session.current_period} · {formatClock(clockSecs)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: "var(--text)" }}>
                <ClubName />{" "}
                <span style={{ color: "var(--accent)" }}>{session.home_score}</span>
                {" — "}
                <span>{session.away_score}</span>
                {" "}{opponent}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: SANS }}>
              {opponent} · {session.away_score} points · {awayRebOff + awayRebDef} rebounds · {awayFoulsGame} fouls
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onExport && (
              <button
                onClick={() => { onClose(); setTimeout(onExport, 50); }}
                style={{
                  height: 48, padding: "0 20px", borderRadius: 10,
                  border: "1px solid var(--accent)",
                  background: "var(--accentSoft)", color: "var(--accent)",
                  fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ↗ Export
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                height: 48, padding: "0 24px", borderRadius: 10, border: "none",
                background: "var(--accent)", color: "var(--accentInk)",
                fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Back to game
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: COL, gap: 8,
            padding: "0 8px 8px 8px", minWidth: 1200,
          }}>
            <span style={{ ...headerCell, textAlign: "left" }}>PLAYER</span>
            <span style={headerCell}>MIN</span>
            <span style={headerCell}>PTS</span>
            <span style={headerCell}>2P M/A</span>
            <span style={headerCell}>3P M/A</span>
            <span style={headerCell}>FT M/A</span>
            <span style={headerCell}>REB O/D</span>
            <span style={headerCell}>AST</span>
            <span style={headerCell}>STL</span>
            <span style={headerCell}>TOV</span>
            <span style={headerCell}>BLK</span>
            <span style={headerCell}>PF</span>
            <span style={headerCell}>D·O·T·U</span>
            <span style={headerCell}>EFF</span>
          </div>

          {/* Player rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 1200 }}>
            {orderedRoster.map((player) => {
              const isOnCourt = onCourtIds.includes(player.user_id);
              const s = playerMap.get(player.user_id);
              const rowStyle: React.CSSProperties = {
                display: "grid", gridTemplateColumns: COL, gap: 8,
                padding: "10px 8px", borderRadius: 12, alignItems: "center",
                background: isOnCourt ? "var(--panel)" : "transparent",
                border: `1px ${isOnCourt ? "solid" : "dashed"} var(--line)`,
                opacity: isOnCourt ? 1 : 0.75,
              };
              return (
                <div
                  key={player.user_id}
                  style={{
                    ...rowStyle, cursor: "pointer",
                    outline: chartPlayer === player.user_id ? "2px solid var(--accent)" : "none",
                  }}
                  title="Tap to see this player's shot chart"
                  onClick={() => setChartPlayer((cur) => (cur === player.user_id ? "all" : player.user_id))}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>
                      #{player.jersey_number ?? "–"}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {player.user.name}
                    </span>
                  </div>
                  <span style={numCell}>{formatMinutes(secsById?.get(player.user_id))}</span>
                  <span style={{ ...numCell, fontSize: 20, fontWeight: 700 }}>{s?.pts ?? 0}</span>
                  <span style={numCell}>{fmt(s?.fg2_made ?? 0, s?.fg2_att ?? 0)}</span>
                  <span style={numCell}>{fmt(s?.fg3_made ?? 0, s?.fg3_att ?? 0)}</span>
                  <span style={numCell}>{fmt(s?.ft_made ?? 0, s?.ft_att ?? 0)}</span>
                  <span style={numCell}>{(s?.reb_off ?? 0)}/{(s?.reb_def ?? 0)}</span>
                  <span style={numCell}>{s?.ast ?? 0}</span>
                  <span style={numCell}>{s?.stl ?? 0}</span>
                  <span style={numCell}>{s?.tov ?? 0}</span>
                  <span style={numCell}>{s?.blk ?? 0}</span>
                  <span style={{ ...numCell, fontWeight: 700 }}>{s?.fouls_total ?? 0}</span>
                  <span style={{ ...numCell, fontSize: 12, letterSpacing: "0.04em" }}>
                    {s?.fouls_def ?? 0}·{s?.fouls_of ?? 0}·{s?.fouls_tec ?? 0}·{s?.fouls_anti ?? 0}
                  </span>
                  <span style={{ ...numCell, fontWeight: 700 }}>{efficiency(s)}</span>
                </div>
              );
            })}

            {/* Total row */}
            <div style={{
              display: "grid", gridTemplateColumns: COL, gap: 8,
              padding: "10px 8px", borderRadius: 12, alignItems: "center",
              background: "var(--accentSoft)", border: "1px solid var(--accent)", marginTop: 4,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)", fontFamily: SANS }}>
                TEAM TOTAL
              </span>
              <span style={{ ...numCell, color: "var(--accent)" }}>—</span>
              <span style={{ ...numCell, fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{totPts}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{fmt(totFg2m, totFg2a)}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{fmt(totFg3m, totFg3a)}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{fmt(totFtm, totFta)}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{totRo}/{totRd}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{totAst}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{totStl}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{totTov}</span>
              <span style={{ ...numCell, color: "var(--accent)" }}>{totBlk}</span>
              <span style={{ ...numCell, fontWeight: 700, color: "var(--accent)" }}>{totFf}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--accent)", textAlign: "right", fontFamily: SANS }}>
                DEF·OFF·TECH·UNSP
              </span>
              <span style={{ ...numCell, fontWeight: 700, color: "var(--accent)" }}>{totEff}</span>
            </div>
          </div>
        </div>

        {/* Shot chart — made and missed, by court zone */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>
            Shot chart
          </span>
          <ShotReport
            plays={plays as never}
            players={roster.map((r) => ({ id: r.user_id, name: r.user.name, number: r.jersey_number }))}
            emptyText="No located shots yet"
            selectedPlayerId={chartPlayer}
            onSelectPlayer={setChartPlayer}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Tip: tap a player row in the table above to see only their shots.</span>
        </div>

        {/* AI analysis for the coach */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>
            AI analysis · coach insights
          </span>
          <AiAnalysis sessionId={session.id} />
        </div>
      </div>
    </div>
  );
}
