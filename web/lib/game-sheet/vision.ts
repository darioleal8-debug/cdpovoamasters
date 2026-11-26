/**
 * Interpretação visual do boletim com o DeepSeek (reutiliza o cliente partilhado lib/deepseek).
 *
 * Fluxo: pré-processamento → leitura completa (1 chamada) → validação do esquema →
 * motor determinístico → [opcional] segunda leitura só das regiões duvidosas (no máximo
 * 1 chamada extra, e só se houver tempo dentro do orçamento).
 */
import { deepseekJSONDetailed, type DeepSeekCallMeta, type DeepSeekErrorKind } from "@/lib/deepseek";
import { AiRecheckSchema, AiScorePassSchema, AiSheetSchema, aiToSheetData, type AiSheet, type SheetData } from "./schema";
import { analyzeSheet, doubtfulEvents } from "./engine";
import {
  buildRecheckPrompt, buildScorePassSystemPrompt, buildScorePassUserPrompt, buildSystemPrompt, buildUserPrompt, DEFAULT_LAYOUT,
} from "./prompt";
import { cropRegions, prepareForVision, scoreTiles, type ZoneMap } from "./image";
import { imageDetail } from "@/lib/match-docs/documents";

export function visionConfig() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    model: process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
    secondPass: (process.env.GAME_SHEET_SECOND_PASS ?? "on") !== "off",
    /** Leitura dedicada da marcha (ampliações) quando a leitura global não a consegue ler */
    scorePass: (process.env.GAME_SHEET_SCORE_PASS ?? "on") !== "off",
    maxAnalyses: num(process.env.GAME_SHEET_MAX_ANALYSES, 3),
    maxOutputTokens: num(process.env.GAME_SHEET_MAX_OUTPUT_TOKENS, 8192),
    timeBudgetMs: num(process.env.GAME_SHEET_TIME_BUDGET_MS, 50_000),
  };
}

export interface VisionUsage {
  model: string;
  calls: (DeepSeekCallMeta & { purpose: "full" | "score" | "recheck"; ok: boolean })[];
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  secondPass: "skipped" | "not_needed" | "done" | "failed";
  /** Leitura dedicada da marcha do resultado em ampliações */
  scorePass?: "skipped" | "not_needed" | "done" | "failed";
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

type AiEvent = AiSheet["scoringEvents"][number];

/**
 * A leitura global precisa de ajuda? Sem nenhum cesto, ou quando a marcha lida de uma equipa
 * fica muito abaixo do resultado final que o próprio modelo leu (leitura truncada/parcial).
 */
export function needsScorePass(ai: AiSheet): boolean {
  if (ai.scoringEvents.length === 0) return true;
  for (const t of ["A", "B"] as const) {
    const final = ai.finalScore[t];
    if (final === null || final < 10) continue;
    const max = Math.max(0, ...ai.scoringEvents.filter((e) => e.team === t).map((e) => e.cumulativeScore ?? 0));
    if (max < final * 0.75) return true;
  }
  return false;
}

/**
 * Junta os cestos da leitura global com os da leitura dedicada (as ampliações sobrepõem-se, por
 * isso o mesmo cesto pode vir repetido). Um cesto é identificado por equipa + acumulado; em caso
 * de conflito fica o de maior confiança. Reordena por acumulado e refaz o "seq" de cada equipa.
 * Os cestos vindos de ampliações não têm região (as coordenadas seriam relativas ao ladrilho).
 */
export function mergeScoringEvents(base: AiEvent[], extra: AiEvent[]): AiEvent[] {
  const fromExtra = new Set(extra);
  const best = new Map<string, AiEvent>();
  for (const e of [...base, ...extra]) {
    if (e.team === null || e.cumulativeScore === null) continue;
    const k = `${e.team}:${e.cumulativeScore}`;
    const prev = best.get(k);
    if (!prev || (e.confidence ?? 0) > (prev.confidence ?? 0)) best.set(k, e);
  }
  const out: AiEvent[] = [];
  for (const team of ["A", "B"] as const) {
    [...best.values()]
      .filter((e) => e.team === team)
      .sort((a, b) => a.cumulativeScore! - b.cumulativeScore!)
      .forEach((e, i) => out.push({ ...e, seq: i, region: fromExtra.has(e) ? null : e.region }));
  }
  return out;
}

export async function analyzeGameSheet(input: {
  image: Buffer;
  game: { home: string; away: string; date?: string | null };
  /** Instruções livres do admin da liga (releitura dirigida). */
  adminInstructions?: string;
  /** Plantel registado das equipas (referência para números/nomes) */
  rosterHint?: string;
  /** Zonas detetadas pelo microserviço OpenCV (injetadas no prompt). */
  opencvZones?: ZoneMap;
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
    feature: "folha-jogo",
    model: cfg.model,
    system: buildSystemPrompt(DEFAULT_LAYOUT, input.adminInstructions, input.opencvZones),
    user: [
      { type: "image_url", image_url: { url: dataUrl(prepared.buffer), detail: imageDetail() } },
      { type: "text", text: buildUserPrompt(input.game, input.rosterHint) },
    ],
    temperature: 0,
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
  let ai = parsed.data;

  // ── 1b. Leitura dedicada da marcha (ampliações), só se a global não a conseguiu ler ──
  usage.scorePass = needsScorePass(ai) ? "skipped" : "not_needed";
  if (usage.scorePass === "skipped" && cfg.scorePass) {
    const remainingForScore = cfg.timeBudgetMs - (Date.now() - started);
    if (remainingForScore > 15_000) {
      const tiles = await scoreTiles(prepared).catch(() => []);
      if (tiles.length > 0) {
        const pass = await deepseekJSONDetailed<unknown>({
          feature: "folha-jogo",
          model: cfg.model,
          system: buildScorePassSystemPrompt(DEFAULT_LAYOUT, input.adminInstructions),
          user: [
            { type: "image_url", image_url: { url: dataUrl(prepared.buffer), detail: imageDetail() } },
            ...tiles.map((t) => ({ type: "image_url", image_url: { url: dataUrl(t.buffer), detail: imageDetail() } })),
            { type: "text", text: buildScorePassUserPrompt(input.game, tiles.map((t) => t.label), ai.finalScore, input.rosterHint) },
          ],
          temperature: 0,
          maxTokens: cfg.maxOutputTokens,
          maxRetryTokens: cfg.maxOutputTokens * 2,
          timeoutMs: remainingForScore - 5_000,
        });
        usage.calls.push({ ...pass.meta, purpose: "score", ok: pass.ok });
        const sp = pass.ok ? AiScorePassSchema.safeParse(pass.data) : null;
        if (sp?.success && sp.data.scoringEvents.length > 0) {
          const merged = mergeScoringEvents(ai.scoringEvents, sp.data.scoringEvents);
          const gained = merged.length > ai.scoringEvents.length;
          // A leitura global desistiu da marcha: esse aviso deixa de ser verdadeiro
          const warnings = gained && ai.scoringEvents.length === 0
            ? ai.warnings.filter((w) => !/marcha|scoringEvents/i.test(w))
            : ai.warnings;
          ai = {
            ...ai,
            scoringEvents: merged,
            warnings: [...warnings, ...sp.data.warnings, "Marcha do resultado lida numa 2.ª leitura dedicada, com ampliações da folha."].slice(0, 50),
          };
          usage.scorePass = "done";
        } else {
          usage.scorePass = "failed";
        }
      }
    }
  }

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
    feature: "folha-jogo",
        model: cfg.model,
        system: buildSystemPrompt(DEFAULT_LAYOUT, input.adminInstructions),
        user: [
          { type: "image_url", image_url: { url: dataUrl(crop), detail: imageDetail() } },
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
