import { describe, it, expect } from "vitest";
import { buildNewsFacts, unknownScores } from "./news-facts";

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

  it("só marcadores confirmados e aviso de pontos por atribuir", () => {
    const f = buildNewsFacts({
      ...REF,
      players: [{ nome: "Ana", side: "home", pontos: 20, triplos: 2 }, { nome: "Rui", side: "away", pontos: 0 }],
      unattributed: { home: 33, away: 55 },
    });
    const text = f.lines.join("\n");
    expect(text).toContain("Marcadores confirmados PowerTogether: Ana 20 pts (2 triplos)");
    expect(text).not.toContain("Rui");
    expect(text).toContain("33 ponto(s) sem marcador identificado");
  });

  it("deteta pontuações citadas que não constam dos factos", () => {
    const f = buildNewsFacts(REF);
    expect(unknownScores("Venceu por 55-53, depois de 38-47 no fim do 3.º período.", f.allowedScores)).toEqual([]);
    expect(unknownScores("Uma corrida de 12-0 decidiu.", f.allowedScores)).toEqual(["12-0"]);
    expect(unknownScores("Jogo de 2026-10-20 às 21:30.", f.allowedScores)).toEqual([]);
  });
});
