"use client";

import type { GameSession, PlayByPlay } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import { deriveStats } from "@/lib/live/derive-stats";
import { formatClock } from "@/hooks/use-live-game";
import { MONO, SANS } from "./tokens";

interface SummaryOverlayProps {
  session: GameSession;
  roster: PlayerWithUser[];
  onCourtIds: string[];
  plays: PlayByPlay[];
  clockSecs: number;
  tokens: React.CSSProperties;
  onClose: () => void;
  onExport?: () => void;
}

const COL = "200px 64px 84px 84px 84px 110px 64px 64px 64px 64px 70px 108px";

function fmt(made: number, att: number) { return `${made}/${att}`; }

export function SummaryOverlay({
  session, roster, onCourtIds, plays, clockSecs, tokens, onClose, onExport,
}: SummaryOverlayProps) {
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
  let totFd = 0, totFo = 0, totFt = 0, totFa = 0, totFf = 0;
  for (const s of playerMap.values()) {
    totPts += s.pts; totFg2m += s.fg2_made; totFg2a += s.fg2_att;
    totFg3m += s.fg3_made; totFg3a += s.fg3_att;
    totFtm += s.ft_made; totFta += s.ft_att;
    totRo += s.reb_off; totRd += s.reb_def;
    totAst += s.ast; totStl += s.stl; totBlk += s.blk; totTov += s.tov;
    totFd += s.fouls_def; totFo += s.fouls_of; totFt += s.fouls_tec; totFa += s.fouls_anti;
    totFf += s.fouls_total;
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
              Resumo estatístico · {session.current_period}º Período · {formatClock(clockSecs)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: "var(--text)" }}>
                CD Póvoa{" "}
                <span style={{ color: "var(--accent)" }}>{session.home_score}</span>
                {" — "}
                <span>{session.away_score}</span>
                {" "}PT
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: SANS }}>
              {session.opponent_name} · {session.away_score} pontos · {awayRebOff + awayRebDef} ressaltos · {session.away_fouls ?? 0} faltas
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
                ↗ Exportar
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
              Voltar ao jogo
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: COL, gap: 8,
            padding: "0 8px 8px 8px", minWidth: 1060,
          }}>
            <span style={{ ...headerCell, textAlign: "left" }}>JOGADOR</span>
            <span style={headerCell}>PTS</span>
            <span style={headerCell}>2P M/T</span>
            <span style={headerCell}>3P M/T</span>
            <span style={headerCell}>LL M/T</span>
            <span style={headerCell}>RES OF/DEF</span>
            <span style={headerCell}>AST</span>
            <span style={headerCell}>ROU</span>
            <span style={headerCell}>PER</span>
            <span style={headerCell}>BLO</span>
            <span style={headerCell}>FALT</span>
            <span style={headerCell}>D·O·T·A</span>
          </div>

          {/* Player rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 1060 }}>
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
                <div key={player.user_id} style={rowStyle}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>
                      #{player.jersey_number ?? "–"}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {player.user.name}
                    </span>
                  </div>
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
                TOTAL EQUIPA
              </span>
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
                DEF·OF·TÉC·ANTI
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
