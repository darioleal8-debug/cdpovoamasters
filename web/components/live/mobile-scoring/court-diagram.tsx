"use client";

import { useCallback } from "react";

interface ShotMark {
  x:     number;  // 0–1 normalizado
  y:     number;  // 0–1 normalizado
  made:  boolean;
}

interface Props {
  recentShots:   ShotMark[];
  onLocationPick: (x: number, y: number, zone: string) => void;
  onSkip:        () => void;
}

function getZone(x: number, y: number): string {
  // y < 0.55 = dentro da área (paint)
  if (y > 0.55) return "paint";
  // fora dos ângulos: 3pt corners
  if (x < 0.2 && y < 0.35) return "3pt_left";
  if (x > 0.8 && y < 0.35) return "3pt_right";
  // linha de 3pt (aprox): além de certa distância do cesto
  // centro do cesto: x=0.5, y=0.85
  const dist = Math.hypot(x - 0.5, y - 0.85);
  if (dist > 0.38) {
    if (x < 0.4) return "3pt_left";
    if (x > 0.6) return "3pt_right";
    return "3pt_top";
  }
  // dentro da área de 3pt: mid-range
  return "mid";
}

// SVG half-court simplified (orientado verticalmente — basket no topo)
const COURT_PATHS = {
  outline:   "M0,0 L100,0 L100,95 L0,95 Z",
  paint:     "M35,75 L65,75 L65,95 L35,95 Z",
  paintTop:  "M35,55 L65,55 L65,75 L35,75 Z",  // free throw lane
  arc3:      "M5,55 Q50,0 95,55",               // 3pt arc
  corner3L:  "M5,0 L5,35",
  corner3R:  "M95,0 L95,35",
  ftLine:    "M35,55 L65,55",
  ftCircle:  "M50,55 m-15,0 a15,15 0 0 0 30,0",
  basket:    "M44,85 L56,85",                    // basket line
  rim:       "M47,87 a3,3 0 0 1 6,0",
};

export function CourtDiagram({ recentShots, onLocationPick, onSkip }: Props) {
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top)  / rect.height;
      const zone = getZone(x, y);
      onLocationPick(x, y, zone);
    },
    [onLocationPick],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const x = (touch.clientX - rect.left) / rect.width;
      const y = (touch.clientY - rect.top)  / rect.height;
      const zone = getZone(x, y);
      onLocationPick(x, y, zone);
    },
    [onLocationPick],
  );

  return (
    <div style={{
      flex:           1,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      background:     "#0D1729",
      padding:        "8px 6px",
      gap:            8,
      position:       "relative",
    }}>
      <p style={{
        fontSize:    11,
        fontWeight:  700,
        color:       "#F97316",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        Toca no campo para marcar localização
      </p>

      <svg
        viewBox="0 0 100 95"
        style={{
          width:         "100%",
          maxWidth:      280,
          maxHeight:     "calc(100% - 80px)",
          cursor:        "crosshair",
          touchAction:   "none",
        }}
        onClick={handleClick}
        onTouchEnd={handleTouch}
        aria-label="Campo de basquetebol — toca para indicar localização"
        role="img"
      >
        {/* Fundo do campo */}
        <rect x="0" y="0" width="100" height="95" fill="#1a2a45" rx="2" />

        {/* Linhas */}
        <path d={COURT_PATHS.outline}   fill="none" stroke="rgba(169,180,199,.3)" strokeWidth="0.8" />
        <path d={COURT_PATHS.paint}     fill="rgba(249,115,22,.06)" stroke="rgba(169,180,199,.25)" strokeWidth="0.6" />
        <path d={COURT_PATHS.paintTop}  fill="none" stroke="rgba(169,180,199,.15)" strokeWidth="0.6" />
        <path d={COURT_PATHS.arc3}      fill="none" stroke="rgba(169,180,199,.25)" strokeWidth="0.6" />
        <line x1="5"  y1="0" x2="5"  y2="35" stroke="rgba(169,180,199,.25)" strokeWidth="0.6" />
        <line x1="95" y1="0" x2="95" y2="35" stroke="rgba(169,180,199,.25)" strokeWidth="0.6" />
        <path d={COURT_PATHS.ftLine}    fill="none" stroke="rgba(169,180,199,.2)" strokeWidth="0.6" />
        <path d={COURT_PATHS.ftCircle}  fill="none" stroke="rgba(169,180,199,.2)" strokeWidth="0.6" />
        <line x1="44" y1="85" x2="56" y2="85" stroke="rgba(169,180,199,.5)" strokeWidth="1" />
        <path d="M47,87 a3,3 0 0 1 6,0"       fill="none" stroke="rgba(169,180,199,.5)" strokeWidth="0.8" />

        {/* Tiros anteriores */}
        {recentShots.map((s, i) => (
          <circle
            key={i}
            cx={s.x * 100}
            cy={s.y * 95}
            r={2.5}
            fill={s.made ? "rgba(34,197,94,.7)" : "rgba(239,68,68,.7)"}
            stroke="rgba(0,0,0,.3)"
            strokeWidth="0.4"
          />
        ))}
      </svg>

      <button
        type="button"
        onClick={onSkip}
        style={{
          padding:      "8px 20px",
          borderRadius: 8,
          border:       "1px solid rgba(169,180,199,.2)",
          background:   "transparent",
          color:        "rgba(169,180,199,.5)",
          fontSize:     12,
          cursor:       "pointer",
          touchAction:  "manipulation",
        }}
      >
        Sem localização
      </button>
    </div>
  );
}
