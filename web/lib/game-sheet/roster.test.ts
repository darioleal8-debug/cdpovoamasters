import { describe, it, expect } from "vitest";
import { matchHoophubPlayers } from "./roster";
import { emptySheetData, type SheetData } from "./schema";

function sheet(): SheetData {
  const s = emptySheetData({ home: "CD Póvoa", away: "X" });
  s.players = [
    { id: "p1", side: "home", number: 7, name: "Rui Silva", hoophubPlayerId: null, fouls: null, played: null, confidence: 0.9 },
    { id: "p2", side: "home", number: 8, name: "Nome ilegível", hoophubPlayerId: null, fouls: null, played: null, confidence: 0.4 },
    { id: "p3", side: "away", number: 7, name: "Rui Silva", hoophubPlayerId: null, fouls: null, played: null, confidence: 0.9 },
  ];
  return s;
}

describe("matchHoophubPlayers", () => {
  const roster = [
    { player_id: "11111111-1111-4111-8111-111111111111", name: "Rui Manuel Silva", number: 7 },
    { player_id: "22222222-2222-4222-8222-222222222222", name: "Paulo Costa", number: 8 },
  ];

  it("associa quando número e nome coincidem, só na equipa indicada", () => {
    const s = matchHoophubPlayers(sheet(), "home", roster);
    expect(s.players[0].hoophubPlayerId).toBe(roster[0].player_id);
    expect(s.players[2].hoophubPlayerId).toBeNull();
  });

  it("não associa quando o nome não bate com o número (ambíguo)", () => {
    expect(matchHoophubPlayers(sheet(), "home", roster).players[1].hoophubPlayerId).toBeNull();
  });

  it("não associa com números repetidos no plantel", () => {
    const dup = [...roster, { player_id: "33333333-3333-4333-8333-333333333333", name: "Rui Silva", number: 7 }];
    expect(matchHoophubPlayers(sheet(), "home", dup).players[0].hoophubPlayerId).toBeNull();
  });
});
