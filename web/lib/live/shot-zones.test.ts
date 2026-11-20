import { describe, it, expect } from "vitest";
import {
  BASKET_POINT, FREE_THROW_POINT, classifyShotZone, isThreePointArea, resolveShotSpot, shotsFromPlays, zoneStats,
} from "./shot-zones";

describe("classifyShotZone", () => {
  it("under the basket is the restricted area", () => {
    expect(classifyShotZone(BASKET_POINT.x, BASKET_POINT.y + 2)).toBe("restricted_area");
  });
  it("inside the key, outside the restricted arc, is the paint", () => {
    expect(classifyShotZone(50, 35)).toBe("paint");
  });
  it("free throw line area is the paint", () => {
    expect(classifyShotZone(FREE_THROW_POINT.x, FREE_THROW_POINT.y - 2)).toBe("paint");
  });
  it("mid-range is split left / centre / right", () => {
    expect(classifyShotZone(20, 28)).toBe("mid_left");
    expect(classifyShotZone(50, 55)).toBe("mid_center");
    expect(classifyShotZone(80, 28)).toBe("mid_right");
  });
  it("corners and arc are 3PT zones", () => {
    expect(classifyShotZone(2, 6)).toBe("three_corner_left");
    expect(classifyShotZone(98, 6)).toBe("three_corner_right");
    expect(classifyShotZone(50, 95)).toBe("three_top");
    expect(classifyShotZone(10, 60)).toBe("three_wing_left");
    expect(classifyShotZone(90, 60)).toBe("three_wing_right");
  });
});

describe("isThreePointArea", () => {
  it("is false inside the arc and true behind it", () => {
    expect(isThreePointArea(50, 40)).toBe(false);
    expect(isThreePointArea(50, 95)).toBe(true);
    expect(isThreePointArea(2, 6)).toBe(true);
  });
});

describe("shotsFromPlays / zoneStats", () => {
  const base = { is_home_team: true, deleted_at: null };
  const plays = [
    { ...base, event_type: "2pt_made", shot_x: 50, shot_y: 35, shot_zone: "paint", player_id: "a" },
    { ...base, event_type: "2pt_miss", shot_x: 50, shot_y: 35, shot_zone: "paint", player_id: "a" },
    { ...base, event_type: "3pt_made", shot_x: 50, shot_y: 95, shot_zone: "three_top", player_id: "b" },
    { ...base, event_type: "ft_made", shot_x: 50, shot_y: 41, shot_zone: "free_throw", player_id: "a" },
    { ...base, event_type: "2pt_made", shot_x: null, shot_y: null, shot_zone: null, player_id: "a" },
    { ...base, event_type: "2pt_made", shot_x: 50, shot_y: 35, shot_zone: "paint", player_id: "a", deleted_at: "2026-11-15T00:00:00Z" },
    { ...base, is_home_team: false, event_type: "2pt_made", shot_x: 50, shot_y: 35, shot_zone: "paint", player_id: null },
  ];
  it("ignores undone plays, opponent plays, plays without a spot and free throws", () => {
    expect(shotsFromPlays(plays)).toHaveLength(3);
  });
  it("filters by player", () => {
    expect(shotsFromPlays(plays, { playerId: "b" })).toHaveLength(1);
  });
  it("counts made/attempted per zone", () => {
    const z = zoneStats(shotsFromPlays(plays));
    const paint = z.find((s) => s.zone === "paint")!;
    expect(paint.made).toBe(1);
    expect(paint.att).toBe(2);
    expect(paint.pct).toBe(0.5);
    expect(z.find((s) => s.zone === "three_top")!.att).toBe(1);
  });
});

describe("isBlockedShot", () => {
  it("only flags missed 2PT/3PT marked as blocked and not undone", async () => {
    const { isBlockedShot, BLOCKED_DESC } = await import("./shot-zones");
    expect(isBlockedShot({ event_type: "2pt_miss", description: BLOCKED_DESC })).toBe(true);
    expect(isBlockedShot({ event_type: "3pt_miss", description: BLOCKED_DESC })).toBe(true);
    expect(isBlockedShot({ event_type: "2pt_made", description: BLOCKED_DESC })).toBe(false);
    expect(isBlockedShot({ event_type: "2pt_miss", description: null })).toBe(false);
    expect(isBlockedShot({ event_type: "2pt_miss", description: BLOCKED_DESC, deleted_at: "x" })).toBe(false);
  });
});

describe("resolveShotSpot", () => {
  it("accepts a 3PT behind the line and a 2PT inside it untouched", () => {
    expect(resolveShotSpot("3", 50, 95)).toEqual({ ok: true, x: 50, y: 95, snapped: false });
    expect(resolveShotSpot("2", 50, 35)).toEqual({ ok: true, x: 50, y: 35, snapped: false });
  });
  it("rejects a 3PT well inside the line and a 2PT well behind it", () => {
    expect(resolveShotSpot("3", 50, 35)).toMatchObject({ ok: false, reason: "inside_three_line" });
    expect(resolveShotSpot("3", 60, 20)).toMatchObject({ ok: false, reason: "inside_three_line" });
    expect(resolveShotSpot("2", 50, 95)).toMatchObject({ ok: false, reason: "outside_two_area" });
    expect(resolveShotSpot("2", 2, 6)).toMatchObject({ ok: false, reason: "outside_two_area" });
  });
  it("snaps a tap just on the wrong side of the arc", () => {
    // arc top is at y = (1.575 + 6.75) / 14 = 59.46 %
    const inside = resolveShotSpot("3", 50, 58.5);
    expect(inside.ok && inside.snapped).toBe(true);
    if (inside.ok) expect(isThreePointArea(inside.x, inside.y)).toBe(true);
    const outside = resolveShotSpot("2", 50, 60.5);
    expect(outside.ok && outside.snapped).toBe(true);
    if (outside.ok) expect(isThreePointArea(outside.x, outside.y)).toBe(false);
  });
  it("snaps near the corner line and never lets a snapped spot end on the wrong side", () => {
    const c3 = resolveShotSpot("3", 100 * (7.5 + 6.5) / 15, 6); // 0.1 m inside the corner line
    expect(c3.ok && c3.snapped).toBe(true);
    if (c3.ok) expect(isThreePointArea(c3.x, c3.y)).toBe(true);
    const c2 = resolveShotSpot("2", 100 * (7.5 + 6.7) / 15, 6); // 0.1 m behind the corner line
    expect(c2.ok && c2.snapped).toBe(true);
    if (c2.ok) expect(isThreePointArea(c2.x, c2.y)).toBe(false);
  });
  it("the line itself counts as a 2PT", () => {
    const x = 50, y = ((1.575 + 6.75) / 14) * 100;
    expect(isThreePointArea(x, y)).toBe(false);
  });
  it("free throws are always valid", () => {
    expect(resolveShotSpot("ft", 50, 41).ok).toBe(true);
  });
});
