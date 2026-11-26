import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { analyzeGameSheet, mergeScoringEvents, needsScorePass } from "./vision";
import { AiSheetSchema } from "./schema";
import { scoreTiles } from "./image";
import { prepareForVision, sniffImageMime, cropRegions } from "./image";

const GAME = { home: "PowerTogether", away: "Matosinhos Basket" };

async function sheetImage(width = 1200, height = 800, orientation?: number): Promise<Buffer> {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 240, g: 240, b: 235 } } }).jpeg();
  return orientation ? img.withMetadata({ orientation }).toBuffer() : img.toBuffer();
}

function apiResponse(content: unknown, status = 200) {
  const body = status === 200
    ? JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      })
    : String(content);
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

const AI_OK = {
  schemaVersion: 1,
  teams: { A: { name: "PowerTogether" }, B: { name: "Matosinhos" } },
  players: [{ team: "A", number: 7, name: "Jogador Sete", fouls: 1, played: true, confidence: 0.9 }],
  scoringEvents: [
    { team: "A", seq: 0, period: 1, cumulativeScore: 2, points: 2, shotType: "2PT", playerNumber: 7, confidence: 0.95, region: { x: 0.5, y: 0.3, w: 0.02, h: 0.01 } },
    { team: "A", seq: 1, period: 1, cumulativeScore: 5, points: 3, shotType: "3PT", playerNumber: 7, confidence: 0.4, region: { x: 0.5, y: 0.32, w: 0.02, h: 0.01 } },
  ],
  periodScores: [{ period: 1, A: 21, B: 15 }, { period: 2, A: 11, B: 11 }, { period: 3, A: 15, B: 12 }, { period: 4, A: 6, B: 17 }],
  finalScore: { A: 53, B: 55 },
  confidence: 0.8,
};

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test";
  process.env.DEEPSEEK_VISION_MODEL = "vision-test";
  // O fixture AI_OK só lê 2 cestos (até 5 de 53 pontos): sem isto dispararia a leitura dedicada da marcha,
  // que tem os seus próprios testes mais abaixo.
  process.env.GAME_SHEET_SCORE_PASS = "off";
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_VISION_MODEL;
  delete process.env.GAME_SHEET_SECOND_PASS;
  delete process.env.GAME_SHEET_SCORE_PASS;
  vi.unstubAllGlobals();
});

describe("image helpers", () => {
  it("deteta o tipo real pelos magic bytes", async () => {
    expect(sniffImageMime(await sheetImage())).toBe("image/jpeg");
    expect(sniffImageMime(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer())).toBe("image/png");
    expect(sniffImageMime(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(sniffImageMime(Buffer.from("%PDF-1.7 aaaaaaaaaa"))).toBe("application/pdf"); // PDFs aceites (renderizados no servidor)
  });

  it("2. fotografia rodada: corrige a orientação EXIF", async () => {
    const rotated = await sheetImage(1200, 800, 6); // 90° — fica retrato
    const p = await prepareForVision(rotated);
    expect([p.width, p.height]).toEqual([800, 1200]);
  });

  it("preserva a resolução (não amplia) e limita imagens enormes", async () => {
    expect((await prepareForVision(await sheetImage(1000, 700))).width).toBe(1000);
    expect((await prepareForVision(await sheetImage(4000, 3000))).width).toBe(3000);
  });

  it("recorta e amplia regiões duvidosas", async () => {
    const p = await prepareForVision(await sheetImage(2000, 1400));
    const crop = await cropRegions(p, [{ x: 0.5, y: 0.3, w: 0.02, h: 0.01 }]);
    const meta = await sharp(crop!).metadata();
    expect(meta.width).toBeGreaterThan(0.1 * 2000);
    expect(await cropRegions(p, [{ x: 0, y: 0, w: 1, h: 1 }])).toBeNull();
  });
});

describe("analyzeGameSheet", () => {
  it("1. leitura válida + 2.ª leitura só da marcação duvidosa", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse(AI_OK))
      .mockResolvedValueOnce(apiResponse({ events: [{ id: "e2", cumulativeScore: 5, points: 3, shotType: "3PT", playerNumber: 7, confidence: 0.85 }] }));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sheet.final).toEqual({ home: 53, away: 55 });
    expect(r.recheckedEventIds).toEqual(["e2"]);
    expect(r.sheet.events[1].confidence).toBe(0.85);
    expect(r.usage.calls).toHaveLength(2);
    expect(r.usage.secondPass).toBe("done");
    expect(r.usage.promptTokens).toBe(2000);
    // envia a imagem como data URL ao modelo configurado
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("vision-test");
    expect(body.messages[1].content[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("não faz 2.ª chamada quando está desligada por configuração", async () => {
    process.env.GAME_SHEET_SECOND_PASS = "off";
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse(AI_OK));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(r.ok && r.usage.calls.length).toBe(1);
  });

  it("modelo sem suporte a imagens dá erro claro (sem trocar de modelo em silêncio)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse("unknown variant `image_url`, expected `text`", 400));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("vision_unsupported");
    expect(r.error).toContain("DEEPSEEK_VISION_MODEL");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("11. falha do DeepSeek (5xx) repete uma vez e depois falha", async () => {
    vi.mocked(fetch).mockImplementation(async () => apiResponse("upstream error", 503));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(r.ok).toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2); // 1 tentativa + 1 repetição (backoff 1 s)
  }, 10_000);

  it("11. timeout é reportado como timeout", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(!r.ok && r.kind).toBe("timeout");
  });

  it("12. JSON inválido do modelo falha de forma controlada", async () => {
    vi.mocked(fetch).mockImplementation(async () => apiResponse("isto não é json {"));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(!r.ok && r.kind).toBe("invalid_json");
  });

  it("ficheiro que não é imagem é recusado antes de chamar a API", async () => {
    const r = await analyzeGameSheet({ image: Buffer.from("not an image at all"), game: GAME });
    expect(!r.ok && r.kind).toBe("invalid_image");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("leitura dedicada da marcha (ampliações)", () => {
  const NO_EVENTS = {
    ...AI_OK,
    scoringEvents: [],
    warnings: ["Marcha do resultado não foi possível transcrever com fiabilidade; scoringEvents deixados vazios."],
  };
  const PASS = {
    scoringEvents: [
      { team: "A", seq: 0, period: 1, cumulativeScore: 1, points: 1, shotType: "FT", playerNumber: 4, confidence: 0.9, note: null },
      { team: "A", seq: 1, period: 1, cumulativeScore: 4, points: 3, shotType: "3PT", playerNumber: 3, confidence: 0.9, note: null },
      // repetido por sobreposição de ladrilhos, com menos confiança: deve desaparecer
      { team: "A", seq: 2, period: 1, cumulativeScore: 4, points: 3, shotType: "3PT", playerNumber: 3, confidence: 0.5, note: null },
      { team: "B", seq: 0, period: 1, cumulativeScore: 2, points: 2, shotType: "2PT", playerNumber: 9, confidence: 0.8, note: null },
    ],
    warnings: [],
  };

  beforeEach(() => { delete process.env.GAME_SHEET_SCORE_PASS; });

  it("sem cestos na leitura global, lê a marcha em ampliações e junta os eventos", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse(NO_EVENTS))
      .mockResolvedValueOnce(apiResponse(PASS));
    const r = await analyzeGameSheet({ image: await sheetImage(1600, 2200), game: GAME });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usage.calls.map((c) => c.purpose)).toEqual(["full", "score"]);
    expect(r.usage.scorePass).toBe("done");
    expect(r.sheet.events).toHaveLength(3);
    expect(r.sheet.events.filter((e) => e.side === "home").map((e) => e.cumulative)).toEqual([1, 4]);
    expect(r.sheet.events.every((e) => e.region === null)).toBe(true);
    // o aviso "marcha ilegível" da 1.ª leitura deixa de se aplicar
    expect(r.sheet.aiWarnings.some((w) => /ilegível|não foi possível/i.test(w))).toBe(false);
    // a 2.ª chamada leva a folha inteira + 6 ampliações + texto
    const body = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string);
    const content = body.messages[1].content as { type: string }[];
    expect(content.filter((p) => p.type === "image_url")).toHaveLength(7);
    expect(content.at(-1)!.type).toBe("text");
  });

  it("se a leitura dedicada falhar, mantém a leitura global (sem estragar nada)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse(NO_EVENTS))
      .mockResolvedValueOnce(apiResponse("upstream error", 400));
    const r = await analyzeGameSheet({ image: await sheetImage(1600, 2200), game: GAME });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usage.scorePass).toBe("failed");
    expect(r.sheet.events).toHaveLength(0);
    expect(r.sheet.final).toEqual({ home: 53, away: 55 });
  });

  it("não faz a leitura dedicada quando está desligada por configuração", async () => {
    process.env.GAME_SHEET_SCORE_PASS = "off";
    try {
      vi.mocked(fetch).mockResolvedValueOnce(apiResponse(NO_EVENTS));
      const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
      expect(r.ok && r.usage.calls.length).toBe(1);
    } finally {
      delete process.env.GAME_SHEET_SCORE_PASS;
    }
  });

  it("needsScorePass: sem cestos, ou marcha muito abaixo do resultado final", () => {
    const base = AiSheetSchema.parse(AI_OK); // 2 cestos (até 5) e finais 53–55
    expect(needsScorePass({ ...base, scoringEvents: [] })).toBe(true);
    expect(needsScorePass(base)).toBe(true); // A chega a 5 de 53
    const full = { ...base, scoringEvents: base.scoringEvents.map((e) => ({ ...e, cumulativeScore: 53 })) };
    const b = { ...full.scoringEvents[0], team: "B" as const, cumulativeScore: 55 };
    expect(needsScorePass({ ...full, scoringEvents: [...full.scoringEvents, b] })).toBe(false);
  });

  it("mergeScoringEvents: deduplica por equipa+acumulado e reordena", () => {
    const ev = AiSheetSchema.parse({ scoringEvents: PASS.scoringEvents }).scoringEvents;
    const merged = mergeScoringEvents([], ev);
    expect(merged.filter((e) => e.team === "A").map((e) => [e.seq, e.cumulativeScore, e.confidence])).toEqual([[0, 1, 0.9], [1, 4, 0.9]]);
    expect(merged.find((e) => e.team === "B")!.seq).toBe(0);
  });

  it("scoreTiles: 2 colunas × 3 faixas, com sobreposição horizontal de 20 %", async () => {
    const p = await prepareForVision(await sheetImage(1500, 2000));
    const tiles = await scoreTiles(p);
    expect(tiles).toHaveLength(6);
    expect(tiles[0].label).toContain("faixa 1/3");
    expect(tiles[1].label).toContain("direita");
    for (const t of tiles) expect((await sharp(t.buffer).metadata()).width).toBeGreaterThanOrEqual(1400);
  });
});
