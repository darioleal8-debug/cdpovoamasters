import { describe, it, expect } from "vitest";
import { aiToSheetData } from "./schema";
import { analyzeSheet } from "./engine";
import { buildSystemPrompt, buildRecheckPrompt } from "./prompt";
import { GAME, EXPECTED_POINTS, perfectAiSheet, scoreReading } from "./test-fixtures/powertogether-matosinhos";

function pointsByNumber(sheet: ReturnType<typeof aiToSheetData>) {
  const a = analyzeSheet(sheet);
  const out = { A: {} as Record<number, number>, B: {} as Record<number, number> };
  for (const p of a.players) {
    if (p.number === null || p.points === 0) continue;
    const team = (p.side === "home") === sheet.sheetTeamAIsHome ? "A" : "B";
    out[team][p.number] = p.points;
  }
  return { analysis: a, points: out };
}

describe("folha de referência PowerTogether 53–55 Matosinhos", () => {
  it("leitura perfeita → motor reproduz os pontos individuais e fecha as contas", () => {
    const sheet = aiToSheetData(perfectAiSheet(), GAME);
    const { analysis, points } = pointsByNumber(sheet);

    expect(points).toEqual(EXPECTED_POINTS);
    expect(analysis.teams.home.completeness).toBe("complete");
    expect(analysis.teams.away.completeness).toBe("complete");
    expect(analysis.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(analysis.status).toBe("ready_to_confirm");
    expect(analysis.summary.winner).toBe("away");
  });

  it("scoreReading dá 100% à leitura perfeita", () => {
    const ai = perfectAiSheet();
    const { points } = pointsByNumber(aiToSheetData(ai, GAME));
    expect(scoreReading(ai, points)).toEqual({
      cumulativeRecall: 1, playerAccuracy: 1, shotAccuracy: 1, spurious: 0, pointsDiff: [],
    });
  });

  it("armadilha: camisola 80 lida como acumulado é apanhada pelo motor", () => {
    const ai = perfectAiSheet();
    // Erro típico: o "80" manuscrito ao lado do acumulado 4 é lido como acumulado 80
    const ev = ai.scoringEvents.find((e) => e.team === "A" && e.cumulativeScore === 4)!;
    ev.cumulativeScore = 80;
    ev.playerNumber = null;
    const { analysis } = pointsByNumber(aiToSheetData(ai, GAME));
    expect(analysis.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["event_regression"]));
    expect(analysis.status).toBe("needs_review");
    expect(scoreReading(ai).cumulativeRecall).toBeLessThan(1);
  });

  it("armadilha: acumulado de fim de período circundado lido como triplo é apanhado", () => {
    const ai = perfectAiSheet();
    // 21 (fim do 1.º quarto) é lance livre; o círculo no acumulado não faz dele um triplo
    ai.scoringEvents.find((e) => e.team === "A" && e.cumulativeScore === 21)!.shotType = "3PT";
    const { analysis } = pointsByNumber(aiToSheetData(ai, GAME));
    expect(analysis.issues.map((i) => i.code)).toContain("event_shot_mismatch");
  });
});

describe("prompt do layout inatel-fiba", () => {
  const prompt = buildSystemPrompt("inatel-fiba");

  it("explica a estrutura das 4 subcolunas e o lado de cada camisola", () => {
    expect(prompt).toMatch(/\[camisola A \(manuscrita\)\] \[acumulado A \(impresso\)\] \[acumulado B \(impresso\)\] \[camisola B \(manuscrita\)\]/);
    expect(prompt).toMatch(/equipa A está à ESQUERDA/);
    expect(prompt).toMatch(/equipa B está à DIREITA/);
  });

  it("avisa que camisolas podem parecer acumulados", () => {
    expect(prompt).toMatch(/ARMADILHA PRINCIPAL/);
    expect(prompt).toMatch(/JOGADOR 80, não o acumulado 80/);
  });

  it("distingue círculo na camisola (triplo) de círculo no acumulado (fim de período)", () => {
    expect(prompt).toMatch(/acumulado circundado NÃO indica 3 pontos/i);
  });

  it("descreve o lance livre como acumulado carregado e os códigos de falta", () => {
    expect(prompt).toMatch(/carregado\/sobreposto/);
    expect(prompt).toMatch(/São FALTAS/);
  });

  it("não pede pontos por lançamento (calculados pelo motor)", () => {
    expect(prompt).not.toMatch(/"points": 2/);
  });

  it("2.ª leitura repete as regras de colunas e círculos", () => {
    const r = buildRecheckPrompt([{ id: "e1", team: "PowerTogether", cumulative: 4, playerNumber: 80, points: 2, note: null }]);
    expect(r).toMatch(/equipa A à esquerda/);
    expect(r).toMatch(/fim de período/);
  });
});
