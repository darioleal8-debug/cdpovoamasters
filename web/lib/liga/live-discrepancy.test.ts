import { describe, it, expect } from "vitest";
import { liveScoreDiscrepancy, describeDiscrepancy } from "./live-discrepancy";

describe("liveScoreDiscrepancy", () => {
  it("returns null with a single session or matching records", () => {
    expect(liveScoreDiscrepancy([{ teamName: "A", own: 60, opp: 55 }])).toBeNull();
    expect(liveScoreDiscrepancy([
      { teamName: "A", own: 60, opp: 55 },
      { teamName: "B", own: 55, opp: 60 },
    ])).toBeNull();
  });
  it("flags differing scores from the two clubs", () => {
    const d = liveScoreDiscrepancy([
      { teamName: "A", own: 60, opp: 55 },
      { teamName: "B", own: 55, opp: 58 },
    ]);
    expect(d).not.toBeNull();
    expect(describeDiscrepancy(d!)).toBe("A registou 60–55, B registou 55–58");
  });
});
