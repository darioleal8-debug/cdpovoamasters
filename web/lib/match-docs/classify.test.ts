/**
 * Deteção do tipo de documento: uma captura de ecrã de estatísticas enviada (ou assumida) como
 * folha oficial manuscrita tem de ser lida pelo extrator de estatísticas profissionais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { classifyDocument, isDocumentNotPhoto, looksLikeStatsText, resolveDocKind } from "./classify";
import { extractProStats, proStatsStatus } from "./pro-stats-extract";

const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", f), "utf8"));
const USER_IMG = "/mnt/user-data/uploads/918d689a-image.jpg"; // captura Pocket Stat de Matosinhos vs Afuradence
const GAME = { home: "Matosinhos Basket", away: "União Afuradense BelticBasket", date: "2026-11-12" };

let requests: { messages: { role: string; content: unknown }[] }[] = [];
let responses: unknown[] = [];
const chat = (content: unknown) => new Response(JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 },
}), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  requests = []; responses = [];
  process.env.DEEPSEEK_API_KEY = "test";
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const next = responses.shift();
    return next instanceof Response ? next : chat(next ?? {});
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function img() {
  return existsSync(USER_IMG) ? readFileSync(USER_IMG) : sharp({ create: { width: 1248, height: 1418, channels: 3, background: "#1a1a1a" } }).jpeg().toBuffer();
}

describe("classificação do documento", { timeout: 30_000 }, () => {
  it("texto com cabeçalhos de estatística é reconhecido por código", () => {
    expect(looksLikeStatsText("Player FGM-A 2PM-A 3PM-A FTM-A Reb Off Reb Def Reb AST ST TO BS PF FPF EFF PTS Totals")).toBe(true);
    expect(looksLikeStatsText("Folha de jogo FIBA Equipa A Equipa B Árbitro Marcha do resultado")).toBe(false);
  });

  it("captura de ecrã de estatísticas: o conteúdo vence o tipo declarado (folha oficial)", async () => {
    responses.push({ type: "pro_stats", confidence: 0.97, app: "Pocket Stat", reason: "tabela digital" });
    const r = await resolveDocKind({ buffer: await img(), mime: "image/jpeg", declared: "official_sheet" });
    expect(r.kind).toBe("pro_stats");
    expect(r.changed).toBe(true);
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0].messages[0].content)).toContain("pro_stats");
  });

  it("folha manuscrita confirmada: nada muda", async () => {
    responses.push({ type: "official_sheet", confidence: 0.9 });
    const r = await resolveDocKind({ buffer: await img(), mime: "image/jpeg", declared: "official_sheet" });
    expect(r).toMatchObject({ kind: "official_sheet", changed: false });
  });

  it("dúvida (confiança baixa) ou falha da API: mantém o tipo declarado, nunca adivinha", async () => {
    responses.push({ type: "pro_stats", confidence: 0.5 });
    expect(await resolveDocKind({ buffer: await img(), mime: "image/jpeg", declared: "official_sheet" })).toMatchObject({ kind: "official_sheet", changed: false });
    responses.push(new Response("erro", { status: 500 }), new Response("erro", { status: 500 }));
    const c = await classifyDocument({ buffer: await img(), mime: "image/jpeg" });
    expect(c.kind).toBeNull();
  });

  it("tipo desconhecido devolvido pelo modelo é ignorado", async () => {
    responses.push({ type: "outra coisa", confidence: 0.99 });
    expect((await classifyDocument({ buffer: await img(), mime: "image/jpeg" })).kind).toBeNull();
  });
});

describe("leitura da tabela Matosinhos vs Afuradence (12 Nov 2026)", { timeout: 30_000 }, () => {
  it("12 jogadores, totais 54 pontos, sem erros matemáticos → pronta a confirmar", async () => {
    responses.push(fx("dark-matosinhos-afuradence.ai.json"));
    const r = await extractProStats({ buffer: await img(), mime: "image/jpeg", game: GAME, submittingTeam: "Matosinhos Basket" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.data.teams.home!;
    expect(t.players).toHaveLength(12);
    expect(t.totals.pts).toBe(54);
    expect(t.players[0]).toMatchObject({ name: "Gonçalo Lafiente" });
    expect(t.players[0].stats).toMatchObject({ pts: 13, fg2m: 2, fg2a: 6, fg3m: 1, fg3a: 5, ftm: 6, fta: 7, oreb: 2, dreb: 3, reb: 5, tov: 1, pf: 2, fd: 3, eff: 8 });
    expect(t.players[2].stats.eff).toBe(-2); // EFF negativa preservada
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(proStatsStatus(r.data, r.issues)).toBe("ready_to_confirm");
  });
});

describe("fotografia de jogo vs documento", { timeout: 30_000 }, () => {
  it("captura de estatísticas é documento (não pode ser foto/capa)", async () => {
    responses.push({ type: "document", confidence: 0.96 });
    expect(await isDocumentNotPhoto(await img(), "image/jpeg")).toBe(true);
  });
  it("foto real do jogo é aceite", async () => {
    responses.push({ type: "game_photo", confidence: 0.9 });
    expect(await isDocumentNotPhoto(await img(), "image/jpeg")).toBe(false);
  });
  it("dúvida ou falha da API: null (a foto é aceite, nunca se bloqueia por falha técnica)", async () => {
    responses.push({ type: "document", confidence: 0.4 });
    expect(await isDocumentNotPhoto(await img(), "image/jpeg")).toBe(false);
    responses.push(new Response("erro", { status: 500 }), new Response("erro", { status: 500 }));
    expect(await isDocumentNotPhoto(await img(), "image/jpeg")).toBeNull();
    delete process.env.DEEPSEEK_API_KEY;
    expect(await isDocumentNotPhoto(await img(), "image/jpeg")).toBeNull();
  });
});
