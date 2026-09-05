"use client";

import type { GameSession } from "@/types/database";
import { formatClock } from "@/hooks/use-live-game";

interface Props {
  session:     GameSession;
  clockSecs:   number;
  onShowPanel: () => void;
}

const S: Record<string, React.CSSProperties> = {
  bar: {
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "space-between",
    padding:         "0 12px",
    height:          52,
    background:      "#0A1220",
    borderBottom:    "1px solid rgba(255,255,255,.07)",
    flexShrink:      0,
    userSelect:      "none",
    gap:             8,
  },
  team: {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    minWidth:       72,
  },
  teamLabel: {
    fontSize:       9,
    fontWeight:     800,
    letterSpacing:  "0.1em",
    textTransform:  "uppercase" as const,
    color:          "rgba(169,180,199,.5)",
    lineHeight:     1,
  },
  score: {
    fontFamily:    "'Barlow Condensed', 'Barlow', sans-serif",
    fontSize:      36,
    fontWeight:    800,
    lineHeight:    1,
    letterSpacing: "-0.02em",
    color:         "#F0F4FF",
    fontVariantNumeric: "tabular-nums",
  },
  fouls: {
    fontSize:    9,
    fontWeight:  700,
    color:       "rgba(249,115,22,.7)",
    marginTop:   1,
  },
  center: {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    gap:            2,
    flex:           1,
  },
  clock: {
    fontFamily:   "'Barlow Condensed', 'Barlow', monospace",
    fontSize:     20,
    fontWeight:   700,
    color:        "#F0F4FF",
    letterSpacing: "0.04em",
    fontVariantNumeric: "tabular-nums",
  },
  period: {
    fontSize:    10,
    fontWeight:  700,
    color:       "rgba(169,180,199,.5)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  panelBtn: {
    height:       36,
    padding:      "0 10px",
    borderRadius: 8,
    border:       "1px solid rgba(169,180,199,.15)",
    background:   "rgba(169,180,199,.06)",
    color:        "rgba(169,180,199,.5)",
    fontSize:     11,
    cursor:       "pointer",
    touchAction:  "manipulation",
    whiteSpace:   "nowrap" as const,
  },
};

export function ScoreBar({ session, clockSecs, onShowPanel }: Props) {
  const homeFouls = 0; // fouls not tracked at session level for home team yet

  return (
    <div style={S.bar}>
      {/* CD Póvoa */}
      <div style={S.team}>
        <span style={S.teamLabel}>CD Póvoa</span>
        <span style={S.score}>{session.home_score}</span>
        {homeFouls > 0 && <span style={S.fouls}>{homeFouls}F</span>}
      </div>

      {/* Centro — relógio + período */}
      <div style={S.center}>
        <span style={S.clock}>{formatClock(clockSecs)}</span>
        <span style={S.period}>{session.current_period}º Período</span>
      </div>

      {/* Adversário */}
      <div style={S.team}>
        <span style={S.teamLabel}>{session.opponent_name}</span>
        <span style={S.score}>{session.away_score}</span>
        {session.away_fouls > 0 && <span style={S.fouls}>{session.away_fouls}F</span>}
      </div>

      {/* Botão painel */}
      <button style={S.panelBtn} onClick={onShowPanel} aria-label="Ver últimas ações">
        ≡ Ações
      </button>
    </div>
  );
}
