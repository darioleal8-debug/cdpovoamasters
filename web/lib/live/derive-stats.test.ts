import { describe, it, expect } from "vitest";
import { deriveStats } from "./derive-stats";
import type { PlayByPlay } from "@/types/database";

const play = (p: Partial<PlayByPlay> & Record<string, unknown>) =>
  ({ is_home_team: true, period: 1, points_delta: 0, ...p } as unknown as PlayByPlay);

describe("deriveStats (STA-16)", () => {
  it("ignora jogadas com soft-delete", () => {
    const r = deriveStats([play({ player_id: "p1", event_type: "2pt_made", points_delta: 2, deleted_at: "2026-10-01T00:00:00Z" })], 1);
    expect(r.playerMap.get("p1")?.pts ?? 0).toBe(0);
  });
  it("credita a assistência do jogador secundário num cesto convertido (como recordPlay grava)", () => {
    const r = deriveStats([play({ player_id: "p1", secondary_player_id: "p2", event_type: "2pt_made", points_delta: 2 })], 1);
    expect(r.playerMap.get("p2")?.ast).toBe(1);
    expect(r.playerMap.get("p1")?.pts).toBe(2);
  });
  it("não credita assistência em lançamentos falhados", () => {
    const r = deriveStats([play({ player_id: "p1", secondary_player_id: "p2", event_type: "2pt_miss" })], 1);
    expect(r.playerMap.get("p2")?.ast ?? 0).toBe(0);
  });
  it("controlo: jogada 'assist' isolada continua a contar 1", () => {
    const r = deriveStats([play({ player_id: "p2", event_type: "assist" })], 1);
    expect(r.playerMap.get("p2")?.ast).toBe(1);
  });
});
