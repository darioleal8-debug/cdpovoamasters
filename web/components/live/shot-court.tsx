"use client";

import { useMemo, useRef } from "react";
import {
  BASKET_POINT, COURT_L_M, COURT_W_M, FT_RADIUS_M, KEY_HALF_W_M, KEY_LENGTH_M,
  RESTRICTED_RADIUS_M, SHOT_ZONE_LABELS, THREE_CORNER_X_M, THREE_RADIUS_M, BASKET_Y_M,
  classifyShotZone, type ShotPoint, type ZoneStat, type ShotZoneId,
} from "@/lib/live/shot-zones";

/** 10 SVG units per metre; baseline at the top, half-court line at the bottom. */
const U = 10;
const W = COURT_W_M * U;   // 150
const H = COURT_L_M * U;   // 140
const cx = W / 2;
const by = BASKET_Y_M * U;

function CourtLines({ lineOpacity = 0.7 }: { lineOpacity?: number }) {
  const cornerY = by + Math.sqrt(THREE_RADIUS_M ** 2 - THREE_CORNER_X_M ** 2) * U;
  const rx = THREE_CORNER_X_M * U;
  const threePath =
    `M${cx - rx},0 L${cx - rx},${cornerY} ` +
    `A${THREE_RADIUS_M * U},${THREE_RADIUS_M * U} 0 0 0 ${cx + rx},${cornerY} L${cx + rx},0`;
  const keyW = KEY_HALF_W_M * U;
  const ftY = KEY_LENGTH_M * U;
  return (
    <g fill="none" stroke="currentColor" strokeOpacity={lineOpacity} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} />
      <path d={threePath} />
      <rect x={cx - keyW} y={0.5} width={keyW * 2} height={ftY} />
      <path d={`M${cx - FT_RADIUS_M * U},${ftY} A${FT_RADIUS_M * U},${FT_RADIUS_M * U} 0 0 0 ${cx + FT_RADIUS_M * U},${ftY}`} />
      <path d={`M${cx - FT_RADIUS_M * U},${ftY} A${FT_RADIUS_M * U},${FT_RADIUS_M * U} 0 0 1 ${cx + FT_RADIUS_M * U},${ftY}`} strokeDasharray="2 2" />
      <path d={`M${cx - RESTRICTED_RADIUS_M * U},${by} A${RESTRICTED_RADIUS_M * U},${RESTRICTED_RADIUS_M * U} 0 0 0 ${cx + RESTRICTED_RADIUS_M * U},${by}`} />
      <line x1={cx - 9} y1={by - 4} x2={cx + 9} y2={by - 4} strokeWidth={1.4} />
      <circle cx={cx} cy={by + 0.2} r={2.25} stroke="var(--accent, #f97316)" strokeOpacity={1} strokeWidth={1.2} />
    </g>
  );
}

function pctToSvg(x: number, y: number) {
  return { sx: (x / 100) * W, sy: (y / 100) * H };
}

function fgColor(pct: number): string {
  const hue = Math.max(0, Math.min(1, pct / 0.6)) * 120; // 0% red → 60%+ green
  return `hsl(${hue.toFixed(0)} 75% 45%)`;
}

const GRID_X = 75;
const GRID_Y = 70;

// Representative label spot per zone (percent coordinates)
const ZONE_LABEL_POINT: Record<ShotZoneId, { x: number; y: number }> = {
  restricted_area: { x: 50, y: 19 },
  paint: { x: 50, y: 33 },
  mid_left: { x: 21, y: 30 },
  mid_center: { x: 50, y: 52 },
  mid_right: { x: 79, y: 30 },
  three_corner_left: { x: 3, y: 9 },
  three_wing_left: { x: 14, y: 52 },
  three_top: { x: 50, y: 82 },
  three_wing_right: { x: 86, y: 52 },
  three_corner_right: { x: 97, y: 9 },
  free_throw: { x: 50, y: 41 },
};

interface BaseProps {
  className?: string;
  style?: React.CSSProperties;
  /** Optional aria label */
  label?: string;
}

/**
 * Interactive half court. Tap/click to pick a spot (percent coordinates).
 * Also used read-only with markers (shot chart).
 */
export function ShotCourt({
  onPick, selected, markers, className, style, label,
}: BaseProps & {
  onPick?: (x: number, y: number) => void;
  selected?: { x: number; y: number } | null;
  markers?: ShotPoint[];
}) {
  const ref = useRef<SVGSVGElement>(null);

  function handle(e: React.PointerEvent<SVGSVGElement>) {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onPick(Number(x.toFixed(2)), Number(y.toFixed(2)));
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label ?? "Half court"}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", touchAction: "manipulation", cursor: onPick ? "crosshair" : "default", color: "var(--muted, #8a8a8a)", ...style }}
      onPointerDown={handle}
    >
      <rect x={0} y={0} width={W} height={H} rx={2} fill="var(--court-bg, rgba(127,127,127,0.07))" />
      <CourtLines />
      {markers?.map((m, i) => {
        const { sx, sy } = pctToSvg(m.x, m.y);
        return m.made ? (
          <circle key={i} cx={sx} cy={sy} r={1.7} fill="#22c55e" />
        ) : (
          <g key={i} stroke="#ef4444" strokeWidth={1.1} strokeLinecap="round">
            <line x1={sx - 1.8} y1={sy - 1.8} x2={sx + 1.8} y2={sy + 1.8} />
            <line x1={sx + 1.8} y1={sy - 1.8} x2={sx - 1.8} y2={sy + 1.8} />
          </g>
        );
      })}
      {selected && (() => {
        const { sx, sy } = pctToSvg(selected.x, selected.y);
        return (
          <g>
            <circle cx={sx} cy={sy} r={5.2} fill="var(--accent, #f97316)" fillOpacity={0.25} />
            <circle cx={sx} cy={sy} r={2.4} fill="var(--accent, #f97316)" stroke="#fff" strokeWidth={0.8} />
          </g>
        );
      })()}
    </svg>
  );
}

/** Shot chart: made shots (green dot) and missed shots (red cross) on the half court. */
export function ShotChart({ shots, className, style }: BaseProps & { shots: ShotPoint[] }) {
  return <ShotCourt markers={shots} className={className} style={style} label="Shot chart" />;
}

/** Zone map coloured by field-goal percentage, with made/attempted per zone. */
export function ZoneHeatmap({ stats, className, style }: BaseProps & { stats: ZoneStat[] }) {
  const byZone = useMemo(() => new Map(stats.map((s) => [s.zone, s])), [stats]);

  const cells = useMemo(() => {
    const out: { x: number; y: number; fill: string }[] = [];
    for (let gx = 0; gx < GRID_X; gx++) {
      for (let gy = 0; gy < GRID_Y; gy++) {
        const px = ((gx + 0.5) / GRID_X) * 100;
        const py = ((gy + 0.5) / GRID_Y) * 100;
        const z = byZone.get(classifyShotZone(px, py));
        if (!z || z.att === 0 || z.pct === null) continue;
        out.push({ x: gx * (W / GRID_X), y: gy * (H / GRID_Y), fill: fgColor(z.pct) });
      }
    }
    return out;
  }, [byZone]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Shooting zones"
      className={className}
      style={{ width: "100%", height: "auto", display: "block", color: "var(--muted, #8a8a8a)", ...style }}
    >
      <rect x={0} y={0} width={W} height={H} rx={2} fill="var(--court-bg, rgba(127,127,127,0.07))" />
      <g opacity={0.55}>
        {cells.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={W / GRID_X + 0.15} height={H / GRID_Y + 0.15} fill={c.fill} />
        ))}
      </g>
      <CourtLines lineOpacity={0.8} />
      {stats.filter((s) => s.att > 0).map((s) => {
        const p = ZONE_LABEL_POINT[s.zone];
        const { sx, sy } = pctToSvg(p.x, p.y);
        const anchor = p.x < 8 ? "start" : p.x > 92 ? "end" : "middle";
        return (
          <g key={s.zone} fontFamily="system-ui, sans-serif" textAnchor={anchor} style={{ pointerEvents: "none" }}>
            <title>{`${SHOT_ZONE_LABELS[s.zone]}: ${s.made}/${s.att}`}</title>
            <text x={sx} y={sy} fontSize={6.2} fontWeight={800} fill="var(--text, #fff)" stroke="rgba(0,0,0,0.45)" strokeWidth={0.5} paintOrder="stroke">
              {Math.round((s.pct ?? 0) * 100)}%
            </text>
            <text x={sx} y={sy + 5.6} fontSize={4.4} fontWeight={600} fill="var(--text, #fff)" stroke="rgba(0,0,0,0.45)" strokeWidth={0.4} paintOrder="stroke">
              {s.made}/{s.att}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export { BASKET_POINT };
