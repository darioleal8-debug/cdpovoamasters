import { describe, it, expect } from "vitest";
import { buildNewsFacts, mentionedPlayers, playerPointsReliable, unknownScores } from "./news-facts";

const REF = {
  home: "PowerTogether",
  away: "Matosinhos Basket",
  homeScore: 53,
  awayScore: 55,
  periods: [[21, 15], [11, 11], [15, 12], [6, 17]].map(([h, a], i) => ({ periodo: i + 1, home_points: h, away_points: a })),
  players: [],
};

describe("18. factos para a notícia (sem inventar)", () => {
  it("caso 53–55: evolução, maior parcial e reviravolta só a partir dos parciais", () => {
    const f = buildNewsFacts(REF);
    const text = f.lines.join("\n");
    expect(f.periodsConsistent).toBe(true);
    expect(text).toContain("PowerTogether 53-55 Matosinhos Basket");
    expect(text).toContain("1.º período: 21-15 | 21-15");
    expect(text).toContain("4.º período: 6-17 | 53-55");
    expect(text).toContain("Matosinhos Basket perdia por 9 antes do 4.º período e venceu esse período 17-6");
    expect(text).toContain("Maior diferença num período: Matosinhos Basket venceu o 4.º período por 11");
    expect(text).toContain("não menciones marcadores individuais");
  });

  it("sem reviravolta quando o vencedor já liderava", () => {
    const f = buildNewsFacts({ ...REF, homeScore: 60, awayScore: 40, periods: [{ periodo: 1, home_points: 30, away_points: 20 }, { periodo: 2, home_points: 30, away_points: 20 }] });
    expect(f.lines.join("\n")).not.toContain("Reviravolta");
  });

  it("parciais inconsistentes não são usados", () => {
    const f = buildNewsFacts({ ...REF, homeScore: 54 });
    expect(f.periodsConsistent).toBe(false);
    expect(f.lines.join("\n")).toContain("NÃO os uses");
  });

  it("caso PowerTogether 53–55: leitura individual falhada → sem jogadores na notícia", () => {
    const f = buildNewsFacts({
      ...REF,
      players: [
        { nome: "Luís Silva", side: "home", pontos: 21, triplos: 1 },
        { nome: "Hong Sou", side: "home", pontos: 0 },
        { nome: "Gonçalo Campos", side: "away", pontos: 15 },
      ],
      unattributed: { home: 32, away: 40 },
    });
    const text = f.lines.join("\n");
    expect(f.playerPointsReliable).toBe(false);
    expect(text).not.toContain("Marcadores confirmados");
    expect(text).not.toContain("Luís Silva");
    expect(text).toContain("NÃO menciones jogadores");
    expect(f.forbiddenPlayerNames).toContain("Luís Silva");
    expect(mentionedPlayers("Luis Silva foi o melhor marcador.", f.forbiddenPlayerNames)).toEqual(["Luís Silva"]);
    expect(mentionedPlayers("O Matosinhos venceu o 4.º período 17-6.", f.forbiddenPlayerNames)).toEqual([]);
  });

  it("soma que não bate mesmo sem pontos por atribuir registados → descartado", () => {
    expect(playerPointsReliable({ homeScore: 53, awayScore: 55, players: [{ side: "home", pontos: 50 }, { side: "away", pontos: 55 }] })).toBe(false);
  });

  it("leitura completa e coerente → marcadores confirmados", () => {
    const f = buildNewsFacts({
      ...REF,
      players: [
        { nome: "Ana", side: "home", pontos: 33, triplos: 2 },
        { nome: "Bia", side: "home", pontos: 20 },
        { nome: "Rui", side: "away", pontos: 55 },
      ],
    });
    const text = f.lines.join("\n");
    expect(f.playerPointsReliable).toBe(true);
    expect(text).toContain("Marcadores confirmados PowerTogether: Ana 33 pts (2 triplos), Bia 20 pts");
    expect(f.forbiddenPlayerNames).toEqual([]);
  });

  it("deteta pontuações citadas que não constam dos factos", () => {
    const f = buildNewsFacts(REF);
    expect(unknownScores("Venceu por 55-53, depois de 38-47 no fim do 3.º período.", f.allowedScores)).toEqual([]);
    expect(unknownScores("Uma corrida de 12-0 decidiu.", f.allowedScores)).toEqual(["12-0"]);
    expect(unknownScores("Jogo de 2026-10-20 às 21:30.", f.allowedScores)).toEqual([]);
  });
});
