/**
 * Avaliação AO VIVO da leitura de folhas contra o caso de referência.
 * Não corre na suite normal — só quando é passada uma fotografia:
 *
 *   cd web
 *   DEEPSEEK_API_KEY=... DEEPSEEK_VISION_MODEL=... \
 *   GAME_SHEET_EVAL_IMAGE=/caminho/folha-powertogether-matosinhos.jpg \
 *   [GAME_SHEET_THINKING=on] npx vitest run lib/game-sheet/sheet-eval.live.test.ts
 *
 * Imprime a precisão (acumulados, camisolas, tipo de lançamento) e as diferenças de pontos
 * por jogador. Serve para comparar prompts, modelos e definições sem adivinhar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeGameSheet } from "./vision";
import { analyzeSheet } from "./engine";
import { GAME, scoreReading } from "./test-fixtures/powertogether-matosinhos";

const image = process.env.GAME_SHEET_EVAL_IMAGE;

describe.skipIf(!image)("avaliação ao vivo — PowerTogether 53–55 Matosinhos", () => {
  it("lê a folha e mede a precisão", async () => {
    const r = await analyzeGameSheet({ image: readFileSync(image!), game: GAME });
    if (!r.ok) throw new Error(`${r.kind}: ${r.error}`);

    const analysis = analyzeSheet(r.sheet);
    const points = { A: {} as Record<number, number>, B: {} as Record<number, number> };
    for (const p of analysis.players) {
      if (p.number === null || p.points === 0) continue;
      points[(p.side === "home") === r.sheet.sheetTeamAIsHome ? "A" : "B"][p.number] = p.points;
    }
    const s = scoreReading(r.ai, points);
    const pct = (n: number) => `${Math.round(n * 100)}%`;

    console.log([
      `modelo=${r.usage.model} · ${r.usage.calls.length} chamada(s) · ${Math.round(r.usage.totalDurationMs / 1000)} s · ` +
        `${r.usage.promptTokens}p/${r.usage.completionTokens}c tokens · 2.ª leitura: ${r.usage.secondPass}`,
      `final lido: ${r.sheet.final.home}–${r.sheet.final.away} (esperado 53–55)`,
      `acumulados encontrados: ${pct(s.cumulativeRecall)} · camisolas certas: ${pct(s.playerAccuracy)} · ` +
        `tipo de lançamento certo: ${pct(s.shotAccuracy)} · marcações inventadas: ${s.spurious}`,
      `estado: ${analysis.status} · por atribuir: casa ${analysis.teams.home.unattributed}, fora ${analysis.teams.away.unattributed}`,
      s.pointsDiff.length
        ? `pontos errados: ${s.pointsDiff.map((d) => `${d.team}#${d.number} ${d.got}≠${d.expected}`).join(", ")}`
        : "pontos individuais: todos certos",
    ].join("\n"));

    expect(r.sheet.final).toEqual({ home: 53, away: 55 });
  }, 120_000);
});
