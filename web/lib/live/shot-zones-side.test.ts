import { describe, test, expect } from "vitest";
import { shotsFromPlays, zoneStats } from "@/lib/live/shot-zones";

const play = (o: Record<string, unknown>) => ({
  event_type: "2pt_made", shot_x: 50, shot_y: 20, shot_zone: "paint", is_home_team: true, ...o,
}) as Parameters<typeof shotsFromPlays>[0][number];

describe("shotsFromPlays side", () => {
  const plays = [
    play({}),
    play({ is_home_team: false, event_type: "3pt_miss", shot_x: 10, shot_y: 40, shot_zone: "three_wing_left" }),
    play({ is_home_team: false, event_type: "2pt_made" }),
    play({ is_home_team: false, event_type: "ft_miss", shot_zone: "free_throw" }),
    play({ is_home_team: false, event_type: "2pt_miss", deleted_at: "x" }),
  ];

  test("por omissão só a nossa equipa", () => {
    expect(shotsFromPlays(plays)).toHaveLength(1);
  });

  test("side=away devolve só o adversário (sem LL nem anuladas)", () => {
    const s = shotsFromPlays(plays, { side: "away" });
    expect(s).toHaveLength(2);
    expect(s.filter((x) => x.made)).toHaveLength(1);
    expect(zoneStats(s).find((z) => z.zone === "three_wing_left")).toMatchObject({ made: 0, att: 1 });
  });

  test("side=away com lances livres", () => {
    const s = shotsFromPlays(plays, { side: "away", includeFreeThrows: true });
    expect(s.filter((x) => x.kind === "ft")).toHaveLength(1);
  });
});
