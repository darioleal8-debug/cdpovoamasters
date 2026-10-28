/**
 * Interpretação visual do boletim com o DeepSeek (reutiliza o cliente partilhado lib/deepseek).
 *
 * Fluxo: pré-processamento → leitura completa (1 chamada) → validação do esquema →
 * motor determinístico → [opcional] segunda leitura só das regiões duvidosas (no máximo
 * 1 chamada extra, e só se houver tempo dentro do orçamento).
 */
import { deepseekJSONDetailed, type DeepSeekCallMeta, type DeepSeekErrorKind } from "@/lib/deepseek";
import { AiRecheckSchema, AiSheetSchema, aiToSheetData, type AiSheet, type SheetData } from "./schema";
import { analyzeSheet, doubtfulEvents } from "./engine";
import { buildRecheckPrompt, buildSystemPrompt, buildUserPrompt, DEFAULT_LAYOUT } from "./prompt";
import { cropRegions, prepareForVision } from "./image";

export function visionConfig() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    model: process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
    secondPass: (process.env.GAME_SHEET_SECOND_PASS ?? "on") !== "off",
    /** Raciocínio do modelo na leitura completa (GAME_SHEET_THINKING=on). Mais preciso, mais lento. */
    thinking: process.env.GAME_SHEET_THINKING === "on",
    maxAnalyses: num(process.env.GAME_SHEET_MAX_ANALYSES, 3),
    maxOutputTokens: num(process.env.GAME_SHEET_MAX_OUTPUT_TOKENS, 8192),
    timeBudgetMs: num(process.env.GAME_SHEET_TIME_BUDGET_MS, 50_000),
  };
}

export interface VisionUsage {
  model: string;
  calls: (DeepSeekCallMeta & { purpose: "full" | "recheck"; ok: boolean })[];
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  secondPass: "skipped" | "not_needed" | "done" | "failed";
}

export type VisionResult =
  | { ok: true; ai: AiSheet; sheet: SheetData; usage: VisionUsage; recheckedEventIds: string[] }
  | { ok: false; error: string; kind: DeepSeekErrorKind | "invalid_image" | "schema"; usage: VisionUsage };

function dataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function summarize(usage: VisionUsage, started: number): VisionUsage {
  usage.totalDurationMs = Date.now() - started;
  usage.promptTokens = usage.calls.reduce((a, c) => a + (c.promptTokens ?? 0), 0);
  usage.completionTokens = usage.calls.reduce((a, c) => a + (c.completionTokens ?? 0), 0);
  return usage;
}

export async function analyzeGameSheet(input: {
  image: Buffer;
  game: { home: string; away: string; date?: string | null };
}): Promise<VisionResult> {
  const cfg = visionConfig();
  const started = Date.now();
  const usage: VisionUsage = {
    model: cfg.model, calls: [], totalDurationMs: 0, promptTokens: 0, completionTokens: 0, secondPass: "skipped",
  };

  let prepared;
  try {
    prepared = await prepareForVision(input.image);
  } catch {
    return { ok: false, kind: "invalid_image", error: "A imagem não pôde ser lida (ficheiro corrompido ou formato inválido).", usage };
  }

  // ── 1. Leitura completa ──
  const full = await deepseekJSONDetailed<unknown>({
    model: cfg.model,
    system: buildSystemPrompt(DEFAULT_LAYOUT),
    user: [
      { type: "image_url", image_url: { url: dataUrl(prepared.buffer) } },
      { type: "text", text: buildUserPrompt(input.game) },
    ],
    temperature: 0,
    thinking: cfg.thinking,
    maxTokens: cfg.maxOutputTokens,
    maxRetryTokens: cfg.maxOutputTokens * 2,
    timeoutMs: Math.max(10_000, cfg.timeBudgetMs - 5_000),
    transientRetries: 1,
  });
  usage.calls.push({ ...full.meta, purpose: "full", ok: full.ok });
  if (!full.ok) {
    return { ok: false, kind: full.kind, error: full.error, usage: summarize(usage, started) };
  }

  const parsed = AiSheetSchema.safeParse(full.data);
  if (!parsed.success) {
    return { ok: false, kind: "schema", error: "A resposta do modelo não segue o esquema esperado.", usage: summarize(usage, started) };
  }
  const ai = parsed.data;
  const sheet = aiToSheetData(ai, input.game);

  // ── 2. Segunda leitura das regiões duvidosas (opcional, limitada) ──
  const recheckedEventIds: string[] = [];
  const doubtful = doubtfulEvents(sheet, analyzeSheet(sheet)).slice(0, 25);
  const remaining = cfg.timeBudgetMs - (Date.now() - started);
  if (doubtful.length === 0) {
    usage.secondPass = "not_needed";
  } else if (cfg.secondPass && remaining > 20_000) {
    const crop = await cropRegions(prepared, doubtful.map((e) => e.region!)).catch(() => null);
    if (crop) {
      const recheck = await deepseekJSONDetailed<unknown>({
        model: cfg.model,
        system: buildSystemPrompt(DEFAULT_LAYOUT),
        user: [
          { type: "image_url", image_url: { url: dataUrl(crop) } },
          {
            type: "text",
            text: buildRecheckPrompt(doubtful.map((e) => ({
              id: e.id, team: e.side === "home" ? sheet.teams.home.name : sheet.teams.away.name,
              cumulative: e.cumulative, playerNumber: e.playerNumber, points: e.points, note: e.note,
            }))),
          },
        ],
        temperature: 0,
        maxTokens: 2048,
        maxRetryTokens: 2048,
        timeoutMs: remaining - 5_000,
      });
      usage.calls.push({ ...recheck.meta, purpose: "recheck", ok: recheck.ok });
      const rc = recheck.ok ? AiRecheckSchema.safeParse(recheck.data) : null;
      if (rc?.success) {
        usage.secondPass = "done";
        for (const r of rc.data.events) {
          const ev = sheet.events.find((e) => e.id === r.id);
          if (!ev || r.confidence === null || r.confidence < (ev.confidence ?? 0)) continue;
          ev.cumulative = r.cumulativeScore ?? ev.cumulative;
          ev.points = r.points ?? ev.points;
          ev.shotType = r.shotType ?? ev.shotType;
          ev.playerNumber = r.playerNumber ?? ev.playerNumber;
          ev.confidence = r.confidence;
          ev.note = r.note ? `2.ª leitura: ${r.note}` : ev.note;
          recheckedEventIds.push(ev.id);
        }
      } else {
        usage.secondPass = "failed";
      }
    }
  }

  return { ok: true, ai, sheet, usage: summarize(usage, started), recheckedEventIds };
}
