import { describe, it, expect } from "vitest";
import { AiSheetSchema, SheetDataSchema, aiToSheetData, inferTeamAIsHome, emptySheetData } from "./schema";

const GAME = { home: "PowerTogether", away: "Matosinhos Basket" };

describe("AiSheetSchema (resposta do modelo é dado não fiável)", () => {
  it("12. resposta vazia/inválida não rebenta e dá estrutura vazia", () => {
    const r = AiSheetSchema.safeParse({});
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.scoringEvents).toEqual([]);
    expect(r.data.finalScore).toEqual({ A: null, B: null });
  });

  it("descarta itens malformados e coage números em texto", () => {
    const r = AiSheetSchema.parse({
      scoringEvents: [
        { team: "A", seq: "1", cumulativeScore: "2", points: 2, shotType: "2pt", playerNumber: "7", confidence: 95 },
        "lixo",
        { team: "Z", cumulativeScore: 4 },
        { team: "b", cumulativeScore: -3, points: 5, confidence: "x" },
      ],
      finalScore: { A: "53", B: 55.0 },
    });
    expect(r.scoringEvents).toHaveLength(3);
    expect(r.scoringEvents[0]).toMatchObject({ team: "A", seq: 1, cumulativeScore: 2, shotType: "2PT", playerNumber: 7, confidence: 0.95 });
    expect(r.scoringEvents[1].team).toBeNull();
    expect(r.scoringEvents[2]).toMatchObject({ team: "B", cumulativeScore: null, points: null, confidence: null });
    expect(r.finalScore).toEqual({ A: 53, B: 55 });
  });

  it("normaliza regiões em percentagem para 0–1", () => {
    const r = AiSheetSchema.parse({ scoringEvents: [{ team: "A", region: { x: 50, y: 10, w: 5, h: 2 } }] });
    expect(r.scoringEvents[0].region).toEqual({ x: 0.5, y: 0.1, w: 0.05, h: 0.02 });
  });
});

describe("aiToSheetData", () => {
  it("por omissão a Equipa A é a casa", () => {
    expect(inferTeamAIsHome(null, null, GAME.home, GAME.away)).toBe(true);
    expect(inferTeamAIsHome("Power Together", "Matosinhos", GAME.home, GAME.away)).toBe(true);
  });

  it("inverte quando os nomes lidos indicam o contrário", () => {
    const ai = AiSheetSchema.parse({
      teams: { A: { name: "Matosinhos Basket" }, B: { name: "PowerTogether" } },
      finalScore: { A: 55, B: 53 },
      periodScores: [{ period: 1, A: 15, B: 21 }],
      players: [{ team: "A", number: 10, name: "X" }],
      scoringEvents: [{ team: "B", cumulativeScore: 2, playerNumber: 4 }],
    });
    const s = aiToSheetData(ai, GAME);
    expect(s.sheetTeamAIsHome).toBe(false);
    expect(s.final).toEqual({ home: 53, away: 55 });
    expect(s.periods[0]).toEqual({ period: 1, home: 21, away: 15 });
    expect(s.players[0].side).toBe("away");
    expect(s.events[0].side).toBe("home");
    expect(SheetDataSchema.safeParse(s).success).toBe(true);
  });

  it("não inventa jogadores nem eventos sem equipa", () => {
    const ai = AiSheetSchema.parse({ players: [{ number: 5, name: "Sem equipa" }], scoringEvents: [{ cumulativeScore: 2 }] });
    const s = aiToSheetData(ai, GAME);
    expect(s.players).toEqual([]);
    expect(s.events).toEqual([]);
  });

  it("emptySheetData é válido contra o esquema canónico", () => {
    expect(SheetDataSchema.safeParse(emptySheetData(GAME)).success).toBe(true);
  });
});
