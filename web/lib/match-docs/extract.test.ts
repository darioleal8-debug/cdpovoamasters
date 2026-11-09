/**
 * Pipeline completo de extração (preparação → DeepSeek simulado → esquema → validação → 2.ª
 * passagem), com as imagens de exemplo reais e PDFs de várias páginas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { jsPDF } from "jspdf";
import { extractProStats, proStatsStatus } from "./pro-stats-extract";
import { isDetailUnsupportedError, stripImageDetail } from "@/lib/deepseek";

const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", f), "utf8"));
const AROSO = { home: "Aroso", away: "Paredes", date: "2026-11-05" };

type Captured = { model: string; messages: { role: string; content: unknown }[] };
let requests: Captured[] = [];
let responses: unknown[] = [];

function chat(content: unknown) {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 1000, completion_tokens: 500 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  requests = [];
  responses = [];
  process.env.DEEPSEEK_API_KEY = "test";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const next = responses.shift();
    if (next instanceof Response) return next;
    return chat(next ?? {});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function images(req: Captured) {
  const user = req.messages.find((m) => m.role === "user")!;
  return (Array.isArray(user.content) ? user.content : []).filter((p: { type: string }) => p.type === "image_url") as { image_url: { url: string; detail?: string } }[];
}
function text(req: Captured) {
  const user = req.messages.find((m) => m.role === "user")!;
  return Array.isArray(user.content) ? (user.content as { type: string; text?: string }[]).filter((p) => p.type === "text").map((p) => p.text).join("\n") : String(user.content);
}

const POCKET_IMG = "/mnt/user-data/uploads/e9914707-image.jpg";
const DARK_IMG = "/mnt/user-data/uploads/5cd6bf15-image.jpg";
async function sample(path: string, w: number, h: number) {
  return existsSync(path) ? readFileSync(path) : sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).jpeg().toBuffer();
}

describe("extração de estatísticas profissionais (DeepSeek simulado)", () => {
  it("folha Pocket Stat (imagem): envia em alta resolução e devolve dados validados", async () => {
    responses.push(fx("pocketstat-aroso-paredes.ai.json"));
    const r = await extractProStats({ buffer: await sample(POCKET_IMG, 1290, 1366), mime: "image/jpeg", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(requests).toHaveLength(1); // sem inconsistências → sem 2.ª passagem
    const imgs = images(requests[0]);
    expect(imgs.length).toBe(1);
    expect(imgs[0].image_url.detail).toBe("high");
    expect(text(requests[0])).toContain("Documento submetido pela equipa: Aroso");
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.usage.secondPass).toBe("not_needed");
    expect(proStatsStatus(r.data, r.issues)).toBe("ready_to_confirm");
  });

  it("captura de ecrã alta (tema escuro): dividida em secções, tabela sem nome associada pelo total", async () => {
    responses.push(fx("dark-matosinhos-famalicense.ai.json"));
    const r = await extractProStats({ buffer: await sample(DARK_IMG, 1290, 2121), mime: "image/jpeg", game: { home: "Matosinhos Basket", away: "Famalicense" }, submittingTeam: "Matosinhos Basket" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(images(requests[0]).length).toBe(2);
    expect(text(requests[0])).toContain("secção 1/2");
    expect(r.data.teams.home!.players).toHaveLength(12);
    expect(r.data.teams.home!.totals.pts).toBe(43);
  });

  it("PDF de várias páginas: todas as páginas renderizadas + camada de texto como referência", async () => {
    const doc = new jsPDF();
    doc.text("Aroso 46 - 20 Paredes   Q1 16 6  Q2 12 8  Q3 5 6  Q4 13 0", 10, 10);
    for (let i = 0; i < 8; i++) doc.text(`#4 Afonso 14:29 11 1/5 3/5 0/0 0 0 0 1 1 0 2 0 0 +22 5 (linha ${i})`, 10, 20 + i * 8);
    doc.addPage();
    doc.text("Comparação Aroso Paredes Pontos 46 20 Ressaltos 24 0", 10, 10);
    for (let i = 0; i < 8; i++) doc.text(`Assistências 7 - Roubos 11 - Bloqueios 1 (linha ${i})`, 10, 20 + i * 8);
    responses.push(fx("pocketstat-aroso-paredes.ai.json"));
    const r = await extractProStats({ buffer: Buffer.from(doc.output("arraybuffer")), mime: "application/pdf", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pageCount).toBe(2);
    expect(images(requests[0]).length).toBeGreaterThanOrEqual(2);
    const t = text(requests[0]);
    expect(t).toContain("TEXTO EXTRAÍDO DO PDF");
    expect(t).toContain("--- página 2 ---");
    expect(r.usage.usedTextLayer).toBe(true);
  });

  it("2.ª passagem dirigida: só aceita a releitura se resolver a inconsistência", async () => {
    const bad = fx("pocketstat-aroso-paredes.ai.json");
    bad.teams[0].players[10].stats.Pts = "13"; // Orio: 2×5 + 3×1 + 2 = 15
    responses.push(bad);
    responses.push({ rows: [{ id: "home:pp11", stats: { Pts: "15", "2P": "5/5", "3P": "1/2", LL: "2/5" }, note: "o 5 parecia um 3" }] });
    const r = await extractProStats({ buffer: await sample(POCKET_IMG, 1290, 1366), mime: "image/jpeg", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(requests).toHaveLength(2);
    expect(text(requests[1])).toContain("LINHAS A RELER");
    expect(r.data.teams.home!.players[10].stats.pts).toBe(15);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.corrected[0]).toContain("Orio");
  });

  it("releitura que não resolve é rejeitada (o valor original fica e o erro é assinalado)", async () => {
    const bad = fx("pocketstat-aroso-paredes.ai.json");
    bad.teams[0].players[10].stats.Pts = "13";
    responses.push(bad);
    responses.push({ rows: [{ id: "home:pp11", stats: { Pts: "14" } }] });
    const r = await extractProStats({ buffer: await sample(POCKET_IMG, 1290, 1366), mime: "image/jpeg", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.teams.home!.players[10].stats.pts).toBe(13);
    expect(r.issues.some((i) => i.severity === "error" && i.code === "points_formula")).toBe(true);
    expect(proStatsStatus(r.data, r.issues)).toBe("needs_review");
  });

  it("falha da API não inventa dados", async () => {
    responses.push(new Response("erro interno", { status: 500 }), new Response("erro interno", { status: 500 }));
    const r = await extractProStats({ buffer: await sample(POCKET_IMG, 1290, 1366), mime: "image/jpeg", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("http");
  });

  it("documento sem tabelas associáveis → erro claro", async () => {
    responses.push({ teams: [], confidence: 0.2, warnings: ["fotografia ilegível"] });
    const r = await extractProStats({ buffer: await sample(POCKET_IMG, 1290, 1366), mime: "image/jpeg", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("empty");
  });

  it("parâmetro detail recusado pela API → repete sem detail", async () => {
    responses.push(new Response('{"error":{"message":"Unknown field: detail"}}', { status: 400 }));
    responses.push(fx("pocketstat-aroso-paredes.ai.json"));
    const r = await extractProStats({ buffer: await sample(POCKET_IMG, 1290, 1366), mime: "image/jpeg", game: AROSO, submittingTeam: "Aroso" });
    expect(r.ok).toBe(true);
    expect(images(requests[0])[0].image_url.detail).toBe("high");
    expect(images(requests[1])[0].image_url.detail).toBeUndefined();
    expect(isDetailUnsupportedError(400, "unknown field detail")).toBe(true);
    expect(stripImageDetail([{ role: "user", content: [{ type: "image_url", image_url: { url: "x", detail: "high" } }] }])).toEqual([{ role: "user", content: [{ type: "image_url", image_url: { url: "x" } }] }]);
  });
});
