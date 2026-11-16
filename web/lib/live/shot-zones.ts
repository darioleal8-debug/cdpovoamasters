/**
 * Shot zones for the live scorer, the game report and the player profile.
 *
 * Coordinates are stored in play_by_play.shot_x / shot_y as percentages of a
 * FIBA half court (15 m wide x 14 m long):
 *   x: 0 (left)  → 100 (right), as seen on screen
 *   y: 0 (baseline, basket end) → 100 (half-court line)
 * The basket sits at x = 50, y = 11.25.
 */

export const COURT_W_M = 15;
export const COURT_L_M = 14;
export const BASKET_Y_M = 1.575; // basket centre from the baseline
export const THREE_RADIUS_M = 6.75;
export const THREE_CORNER_X_M = 6.6;
export const KEY_HALF_W_M = 2.45;
export const KEY_LENGTH_M = 5.8;
export const FT_RADIUS_M = 1.8;
export const RESTRICTED_RADIUS_M = 1.25;

export type ShotKind = "2" | "3" | "ft";

export type ShotZoneId =
  | "restricted_area"
  | "paint"
  | "mid_left"
  | "mid_center"
  | "mid_right"
  | "three_corner_left"
  | "three_wing_left"
  | "three_top"
  | "three_wing_right"
  | "three_corner_right"
  | "free_throw";

export const SHOT_ZONE_LABELS: Record<ShotZoneId, string> = {
  restricted_area: "Restricted area",
  paint: "Paint",
  mid_left: "Mid-range left",
  mid_center: "Mid-range centre",
  mid_right: "Mid-range right",
  three_corner_left: "3PT left corner",
  three_wing_left: "3PT left wing",
  three_top: "3PT top",
  three_wing_right: "3PT right wing",
  three_corner_right: "3PT right corner",
  free_throw: "Free throw",
};

/** Zones in the order they are listed in reports. */
export const SHOT_ZONE_ORDER: ShotZoneId[] = [
  "restricted_area", "paint",
  "mid_left", "mid_center", "mid_right",
  "three_corner_left", "three_wing_left", "three_top", "three_wing_right", "three_corner_right",
  "free_throw",
];

/** Free throw line position (percent), used when a free throw has no tap. */
export const FREE_THROW_POINT = { x: 50, y: ((KEY_LENGTH_M) / COURT_L_M) * 100 };

/** Basket position (percent). */
export const BASKET_POINT = { x: 50, y: (BASKET_Y_M / COURT_L_M) * 100 };

function toMeters(x: number, y: number) {
  return {
    mx: (x / 100) * COURT_W_M - COURT_W_M / 2, // + → right
    my: (y / 100) * COURT_L_M - BASKET_Y_M,    // + → away from the baseline, measured from the basket
  };
}

/** Is the point outside the 3-point line? */
export function isThreePointArea(x: number, y: number): boolean {
  const { mx, my } = toMeters(x, y);
  return Math.hypot(mx, my) > THREE_RADIUS_M || Math.abs(mx) > THREE_CORNER_X_M;
}

export function classifyShotZone(x: number, y: number): ShotZoneId {
  const { mx, my } = toMeters(x, y);
  const dist = Math.hypot(mx, my);
  const angle = (Math.atan2(mx, my) * 180) / Math.PI; // 0 = straight out from the basket, − left, + right

  if (dist > THREE_RADIUS_M || Math.abs(mx) > THREE_CORNER_X_M) {
    if (Math.abs(mx) > THREE_CORNER_X_M && my <= 1.41) return mx < 0 ? "three_corner_left" : "three_corner_right";
    if (angle < -35) return "three_wing_left";
    if (angle > 35) return "three_wing_right";
    return "three_top";
  }
  if (dist <= RESTRICTED_RADIUS_M) return "restricted_area";
  const inKey = Math.abs(mx) <= KEY_HALF_W_M && my <= KEY_LENGTH_M - BASKET_Y_M;
  if (inKey) return "paint";
  if (angle < -30) return "mid_left";
  if (angle > 30) return "mid_right";
  return "mid_center";
}

export type ShotKindFromEvent = ShotKind | null;

export function shotKindOf(eventType: string): ShotKind | null {
  if (eventType === "2pt_made" || eventType === "2pt_miss") return "2";
  if (eventType === "3pt_made" || eventType === "3pt_miss") return "3";
  if (eventType === "ft_made" || eventType === "ft_miss") return "ft";
  return null;
}

export function isShotEvent(eventType: string): boolean {
  return shotKindOf(eventType) !== null;
}

export function isMadeShot(eventType: string): boolean {
  return eventType === "2pt_made" || eventType === "3pt_made" || eventType === "ft_made";
}

export interface ShotPoint {
  x: number;
  y: number;
  zone: ShotZoneId | string | null;
  made: boolean;
  kind: ShotKind;
}

/** Shots with a recorded location (excludes undone plays and free throws, which have a fixed spot). */
export function shotsFromPlays(
  plays: {
    event_type: string;
    shot_x: number | null;
    shot_y: number | null;
    shot_zone: string | null;
    is_home_team?: boolean;
    player_id?: string | null;
    deleted_at?: string | null;
  }[],
  opts: { playerId?: string; includeFreeThrows?: boolean } = {}
): ShotPoint[] {
  const out: ShotPoint[] = [];
  for (const p of plays) {
    if (p.deleted_at) continue;
    if (p.is_home_team === false) continue;
    if (opts.playerId && p.player_id !== opts.playerId) continue;
    const kind = shotKindOf(p.event_type);
    if (!kind) continue;
    if (kind === "ft" && !opts.includeFreeThrows) continue;
    if (p.shot_x === null || p.shot_y === null || p.shot_x === undefined || p.shot_y === undefined) continue;
    out.push({
      x: Number(p.shot_x), y: Number(p.shot_y), zone: p.shot_zone,
      made: isMadeShot(p.event_type), kind,
    });
  }
  return out;
}

export interface ZoneStat { zone: ShotZoneId; made: number; att: number; pct: number | null }

/** Made/attempted per zone for field-goal attempts (2PT and 3PT). */
export function zoneStats(shots: ShotPoint[]): ZoneStat[] {
  const map = new Map<ShotZoneId, { made: number; att: number }>();
  for (const s of shots) {
    if (s.kind === "ft") continue;
    const zone = (s.zone && (SHOT_ZONE_ORDER as string[]).includes(s.zone) ? s.zone : classifyShotZone(s.x, s.y)) as ShotZoneId;
    const cur = map.get(zone) ?? { made: 0, att: 0 };
    cur.att++;
    if (s.made) cur.made++;
    map.set(zone, cur);
  }
  return SHOT_ZONE_ORDER.filter((z) => z !== "free_throw").map((zone) => {
    const v = map.get(zone) ?? { made: 0, att: 0 };
    return { zone, made: v.made, att: v.att, pct: v.att > 0 ? v.made / v.att : null };
  });
}

/** Stored in play_by_play.description on a missed 2PT/3PT that the opponent blocked ("block received"). */
export const BLOCKED_DESC = "Shot blocked";

export function isBlockedShot(p: { event_type: string; description?: string | null; deleted_at?: string | null }): boolean {
  return !p.deleted_at && (p.event_type === "2pt_miss" || p.event_type === "3pt_miss") && p.description === BLOCKED_DESC;
}
