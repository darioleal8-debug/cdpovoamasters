import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { analyzeGameSheet, flagSuspiciousEvents, mergeRosters, mergeScoringEvents, periodEnds } from "./vision";
import { AiSheetSchema } from "./schema";
import { regionCrop, resolveRegion, scoreBlockCrops, scoreBlocksNeeded, DEFAULT_REGIONS } from "./image";
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
  process.env.GAME_SHEET_ROSTER_PASS = "off";
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_VISION_MODEL;
  delete process.env.GAME_SHEET_SECOND_PASS;
  delete process.env.GAME_SHEET_SCORE_PASS;
  delete process.env.GAME_SHEET_ROSTER_PASS;
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

describe("leitura por recortes (marcha do resultado + plantéis)", () => {
  beforeEach(() => { delete process.env.GAME_SHEET_SCORE_PASS; delete process.env.GAME_SHEET_ROSTER_PASS; });

  // 1.ª chamada (folha inteira): sem cestos, com zonas e parciais
  const FULL = {
    schemaVersion: 1,
    teams: { A: { name: "PowerTogether" }, B: { name: "Matosinhos" } },
    players: [{ team: "A", number: 99, name: "Plantel Errado", fouls: 0, played: true, confidence: 0.4 }],
    scoringEvents: [
      // se a folha inteira devolver cestos, são descartados (a marcha lê-se nos recortes)
      { team: "A", seq: 0, period: 1, cumulativeScore: 2, points: 2, shotType: "2PT", playerNumber: 3, confidence: 0.8 },
    ],
    periodScores: [{ period: 1, A: 9, B: 16 }, { period: 2, A: 15, B: 10 }, { period: 3, A: 10, B: 10 }, { period: 4, A: 9, B: 17 }],
    finalScore: { A: 43, B: 53 },
    regions: { runningScore: { x: 0.48, y: 0.17, w: 0.46, h: 0.61 }, rosterA: { x: 0, y: 0, w: 0.05, h: 0.05 }, rosterB: null },
    confidence: 0.8,
  };
  const SCORE = {
    scoringEvents: [
      { team: "A", cumulativeScore: 1, playerNumber: 4, confidence: 0.9 },
      { team: "A", cumulativeScore: 4, playerNumber: 3, confidence: 0.9 },
      { team: "A", cumulativeScore: 4, playerNumber: 3, confidence: 0.5 }, // repetido pela sobreposição das metades
      { team: "B", cumulativeScore: 1, playerNumber: 8, confidence: 0.9 },
      { team: "B", cumulativeScore: 2, playerNumber: 8, confidence: 0.9 },
      { team: "B", cumulativeScore: 4, playerNumber: 87, confidence: 0.9 },
    ],
    warnings: [],
  };
  const A_PLAYERS = [3, 4, 5, 6, 7, 8].map((n) => ({ team: "A", number: n, name: `Jogador A${n}`, fouls: 1, played: true, confidence: 0.9 }));
  const B_PLAYERS = [8, 24, 78, 80, 87].map((n) => ({ team: "B", number: n, name: `Jogador B${n}`, fouls: 0, played: true, confidence: 0.9 }));
  const ROSTER = { players: [...A_PLAYERS, ...B_PLAYERS], warnings: [] };

  /** Responde a cada chamada conforme o prompt de sistema (as chamadas correm em paralelo). */
  function answerByPrompt(over: { score?: unknown; roster?: unknown } = {}) {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const sys = body.messages[0].content as string;
      if (sys.includes("ler a MARCHA DO RESULTADO")) return apiResponse(over.score ?? SCORE);
      if (sys.includes("quadros de jogadores")) return apiResponse(over.roster ?? ROSTER);
      return apiResponse(FULL);
    });
  }
  const bodies = () => vi.mocked(fetch).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

  it("lê a marcha e os plantéis em recortes e descarta os cestos da folha inteira", async () => {
    answerByPrompt();
    const r = await analyzeGameSheet({ image: await sheetImage(1600, 2200), game: GAME });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usage.calls.map((c) => c.purpose)).toEqual(["full", "score", "roster"]);
    expect(r.usage.scorePass).toBe("done");
    expect(r.usage.rosterPass).toBe("done");
    // cestos só da leitura dedicada, deduplicados e sem valor/período/região (o motor calcula-os)
    expect(r.sheet.events).toHaveLength(5);
    expect(r.sheet.events.filter((e) => e.side === "home").map((e) => [e.cumulative, e.playerNumber])).toEqual([[1, 4], [4, 3]]);
    expect(r.sheet.events.filter((e) => e.side === "away").map((e) => [e.cumulative, e.playerNumber])).toEqual([[1, 8], [2, 8], [4, 87]]);
    expect(r.sheet.events.every((e) => e.points === null && e.shotType === null && e.region === null)).toBe(true);
    // plantéis dos recortes substituem os da folha inteira
    expect(r.sheet.players.map((p) => p.number).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([3, 4, 5, 6, 7, 8, 8, 24, 78, 80, 87]);
    expect(r.sheet.players.some((p) => p.name === "Plantel Errado")).toBe(false);
  });

  it("pede à folha inteira só zonas/parciais e à marcha 4 recortes (2 blocos × 2 metades) para 43–53", async () => {
    answerByPrompt();
    await analyzeGameSheet({ image: await sheetImage(1600, 2200), game: GAME });
    const [full, score, roster] = ["", "ler a MARCHA DO RESULTADO", "quadros de jogadores"].map((k) =>
      bodies().find((b) => (k ? (b.messages[0].content as string).includes(k) : !/ler a MARCHA|quadros de jogadores/.test(b.messages[0].content))))!;
    expect(full.messages[0].content).not.toContain('"scoringEvents": [');
    expect(full.messages[0].content).toContain('"regions"');
    const imgs = (b: typeof full) => (b.messages[1].content as { type: string }[]).filter((p) => p.type === "image_url").length;
    expect(imgs(score)).toBe(4);
    expect(imgs(roster)).toBe(2);
    // a equipa B está espelhada: o prompt di-lo e dá os fins de período como verificação
    expect(score.messages[0].content).toContain("[JOGADOR A] [ACUMULADO A] [ACUMULADO B] [JOGADOR B]");
    const text = (score.messages[1].content as { type: string; text?: string }[]).at(-1)!.text!;
    expect(text).toContain("9 → 24 → 34 → 43");
    expect(text).toContain("16 → 26 → 36 → 53");
  });

  it("se a leitura dos plantéis falhar, mantém os plantéis da folha inteira", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const sys = body.messages[0].content as string;
      if (sys.includes("quadros de jogadores")) return apiResponse("erro", 400);
      return apiResponse(sys.includes("ler a MARCHA DO RESULTADO") ? SCORE : FULL);
    });
    const r = await analyzeGameSheet({ image: await sheetImage(1600, 2200), game: GAME });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usage.rosterPass).toBe("failed");
    expect(r.usage.scorePass).toBe("done");
    expect(r.sheet.players.map((p) => p.number)).toEqual([99]);
  });

  it("se a leitura da marcha falhar, não fica nada da folha inteira (nunca cestos inventados)", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const sys = (JSON.parse((init as RequestInit).body as string).messages[0].content as string);
      if (sys.includes("ler a MARCHA DO RESULTADO")) return apiResponse("erro", 400);
      return apiResponse(sys.includes("quadros de jogadores") ? ROSTER : FULL);
    });
    const r = await analyzeGameSheet({ image: await sheetImage(1600, 2200), game: GAME });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usage.scorePass).toBe("failed");
    expect(r.sheet.events).toHaveLength(0);
    expect(r.sheet.final).toEqual({ home: 43, away: 53 });
  });

  it("com a leitura por recortes desligada, usa a leitura da folha inteira (comportamento anterior)", async () => {
    process.env.GAME_SHEET_SCORE_PASS = "off";
    process.env.GAME_SHEET_ROSTER_PASS = "off";
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse(FULL));
    const r = await analyzeGameSheet({ image: await sheetImage(), game: GAME });
    expect(r.ok && r.usage.calls.length).toBe(1);
    if (!r.ok) return;
    expect(r.sheet.events).toHaveLength(1);
    expect(bodies()[0].messages[0].content).toContain('"scoringEvents": [');
  });

  it("periodEnds / mergeRosters / flagSuspiciousEvents", () => {
    const ai = AiSheetSchema.parse(FULL);
    expect(periodEnds(ai)).toEqual({ A: [9, 24, 34, 43], B: [16, 26, 36, 53] });

    const first = AiSheetSchema.parse({ players: [...A_PLAYERS.slice(0, 2), ...B_PLAYERS] }).players;
    const pass = AiSheetSchema.parse({ players: A_PLAYERS }).players;
    const merged = mergeRosters(first, pass);
    expect(merged.filter((p) => p.team === "A")).toHaveLength(6); // A: ≥5 no recorte → usa o recorte
    expect(merged.filter((p) => p.team === "B")).toHaveLength(5); // B: recorte sem jogadores → mantém a folha inteira

    // 14 cestos de 2 pontos, jogadores a percorrer o plantel por ordem → suspeito
    const fake = AiSheetSchema.parse({
      scoringEvents: Array.from({ length: 14 }, (_, i) => ({ team: "A", cumulativeScore: (i + 1) * 2, playerNumber: [3, 7, 8, 9][i % 4], confidence: 0.8 })),
    }).scoringEvents;
    const { events, flagged } = flagSuspiciousEvents(fake);
    expect(flagged).toEqual(["A"]);
    expect(events.every((e) => (e.confidence ?? 1) <= 0.3)).toBe(true);
    // marcha real (1, 3, 2, 1, 2, 2, …) não é suspeita
    const real = AiSheetSchema.parse({
      scoringEvents: [1, 4, 6, 7, 9, 11, 13, 15, 17, 19, 22, 24, 26].map((c) => ({ team: "A", cumulativeScore: c, playerNumber: 4, confidence: 0.8 })),
    }).scoringEvents;
    expect(flagSuspiciousEvents(real).flagged).toEqual([]);
  });

  it("mergeScoringEvents: deduplica por equipa+acumulado, fica o mais confiante e reordena", () => {
    const ev = AiSheetSchema.parse({ scoringEvents: SCORE.scoringEvents }).scoringEvents;
    const merged = mergeScoringEvents([], ev);
    expect(merged.filter((e) => e.team === "A").map((e) => [e.seq, e.cumulativeScore, e.confidence])).toEqual([[0, 1, 0.9], [1, 4, 0.9]]);
    expect(merged.find((e) => e.team === "B")!.seq).toBe(0);
  });
});

describe("recortes da folha", () => {
  it("scoreBlocksNeeded: um bloco por cada 40 pontos do maior resultado", () => {
    expect(scoreBlocksNeeded(43, 53)).toEqual([1, 2]);
    expect(scoreBlocksNeeded(40, 12)).toEqual([1]);
    expect(scoreBlocksNeeded(null, null)).toEqual([1, 2, 3, 4]);
    expect(scoreBlocksNeeded(200, 10)).toEqual([1, 2, 3, 4]);
  });

  it("resolveRegion: usa a caixa do modelo só se for plausível; senão a posição por omissão", () => {
    const d = DEFAULT_REGIONS.runningScore;
    expect(resolveRegion("runningScore", { x: 0.47, y: 0.18, w: 0.47, h: 0.6 })).toEqual({ region: { x: 0.47, y: 0.18, w: 0.47, h: 0.6 }, source: "model" });
    expect(resolveRegion("runningScore", null)).toEqual({ region: d, source: "template" });
    expect(resolveRegion("runningScore", { x: 0, y: 0, w: 0.05, h: 0.05 }).source).toBe("template"); // minúscula
    expect(resolveRegion("runningScore", { x: 0.1, y: 0.7, w: 0.46, h: 0.25 }).source).toBe("template"); // longe do sítio
    expect(resolveRegion("runningScore", { x: 0.7, y: 0.3, w: 0.46, h: 0.61 }).source).toBe("template"); // fora da imagem
  });

  it("scoreBlockCrops: 2 metades por bloco, ampliadas, com etiquetas dos acumulados", async () => {
    const p = await prepareForVision(await sheetImage(1500, 2000));
    const crops = await scoreBlockCrops(p, DEFAULT_REGIONS.runningScore, [1, 2]);
    expect(crops).toHaveLength(4);
    expect(crops[0].label).toContain("bloco 1, metade superior");
    expect(crops[0].label).toContain("1–21");
    expect(crops[3].label).toContain("bloco 2, metade inferior");
    expect(crops[3].label).toContain("60–80");
    for (const c of crops) {
      const m = await sharp(c.buffer).metadata();
      expect(m.height).toBeGreaterThanOrEqual(1500); // ampliado
      expect(m.width!).toBeLessThan(m.height!); // recorte estreito e alto (um bloco)
    }
  });

  it("regionCrop: recorta o quadro de um plantel", async () => {
    const p = await prepareForVision(await sheetImage(1500, 2000));
    const c = await regionCrop(p, DEFAULT_REGIONS.rosterA, "A");
    const m = await sharp(c!.buffer).metadata();
    expect(m.height).toBeGreaterThanOrEqual(1400);
    expect(m.width!).toBeGreaterThan(m.height! * 0.8); // quadro largo, quase quadrado
  });
});
