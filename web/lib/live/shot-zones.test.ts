import { describe, it, expect } from "vitest";
import {
  BASKET_POINT, FREE_THROW_POINT, classifyShotZone, isThreePointArea, shotsFromPlays, zoneStats,
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
