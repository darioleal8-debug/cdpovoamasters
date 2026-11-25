import { describe, it, expect } from "vitest";
import { matchLeagueTeam, normalizeTeamName, opponentIfTeamPlays } from "./league-mirror";

const teams = [
  { id: "1", name: "CBF Felgueiras BAD" },
  { id: "2", name: "UAA Aroso" },
  { id: "3", name: "Vencedor Jogo 1", is_placeholder: true },
  { id: "4", name: "CD Póvoa" },
];

describe("matchLeagueTeam", () => {
  it("faz match exato ignorando acentos, maiúsculas e espaços", () => {
    expect(matchLeagueTeam("  uaa   aroso ", teams)?.id).toBe("2");
    expect(matchLeagueTeam("cd povoa", teams)?.id).toBe("4");
  });
  it("não faz match parcial nem com placeholders", () => {
    expect(matchLeagueTeam("Felgueiras", teams)).toBeNull();
    expect(matchLeagueTeam("Vencedor Jogo 1", teams)).toBeNull();
  });
  it("ignora equipas já associadas a outro clube", () => {
    expect(matchLeagueTeam("UAA Aroso", teams, new Set(["2"]))).toBeNull();
  });
  it("devolve null com nomes ambíguos", () => {
    expect(matchLeagueTeam("A", [{ id: "a", name: "A" }, { id: "b", name: "a" }])).toBeNull();
  });
  it("normaliza nomes", () => {
    expect(normalizeTeamName("Póvoa  Masters")).toBe("povoa masters");
  });
});

describe("opponentIfTeamPlays", () => {
  const desc = JSON.stringify({ home_team: "UAA Aroso", away_team: "Barca BC" });
  it("devolve adversário e lado", () => {
    expect(opponentIfTeamPlays(desc, "UAA Aroso")).toEqual({ opponent: "Barca BC", isHome: true });
    expect(opponentIfTeamPlays(desc, "Barca BC")).toEqual({ opponent: "UAA Aroso", isHome: false });
  });
  it("null para outras equipas ou JSON inválido", () => {
    expect(opponentIfTeamPlays(desc, "NCR Valongo")).toBeNull();
    expect(opponentIfTeamPlays("não é json", "UAA Aroso")).toBeNull();
    expect(opponentIfTeamPlays(null, "UAA Aroso")).toBeNull();
  });
});
