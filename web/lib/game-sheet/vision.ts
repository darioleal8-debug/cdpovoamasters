/**
 * Interpretação visual do boletim com o DeepSeek (reutiliza o cliente partilhado lib/deepseek).
 *
 * Fluxo: pré-processamento → leitura da folha inteira (cabeçalho, parciais, resultado final e
 * localização das zonas) → em paralelo, leitura da marcha do resultado (recortes ampliados, um por
 * bloco e metade) e dos plantéis (recortes dos dois quadros) → validação do esquema → motor
 * determinístico → [opcional] segunda leitura das regiões duvidosas.
 *
 * Porquê em recortes: o modelo reduz cada imagem a um orçamento fixo de píxeis; a folha inteira
 * numa só imagem deixa a escrita pequena da marcha e dos plantéis ilegível, e o modelo inventa
 * marcações em vez de as ler.
 */
import { deepseekJSONDetailed, type DeepSeekCallMeta, type DeepSeekErrorKind } from "@/lib/deepseek";
import {
  AiRecheckSchema, AiRosterPassSchema, AiScorePassSchema, AiSheetSchema, aiToSheetData, type AiSheet, type SheetData,
} from "./schema";
import { analyzeSheet, doubtfulEvents } from "./engine";
import {
  buildRecheckPrompt, buildRosterPassSystemPrompt, buildRosterPassUserPrompt, buildScorePassSystemPrompt,
  buildScorePassUserPrompt, buildSystemPrompt, buildUserPrompt, DEFAULT_LAYOUT,
} from "./prompt";
import {
  cropRegions, prepareForVision, regionCrop, resolveRegion, scoreBlockCrops, scoreBlocksNeeded, type VisionCrop, type ZoneMap,
} from "./image";
import { imageDetail } from "@/lib/match-docs/documents";

export function visionConfig() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    model: process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
    secondPass: (process.env.GAME_SHEET_SECOND_PASS ?? "on") !== "off",
    /** Leitura da marcha do resultado em recortes ampliados (desligar = lê a marcha na folha inteira) */
    scorePass: (process.env.GAME_SHEET_SCORE_PASS ?? "on") !== "off",
    /** Leitura dos plantéis em recortes ampliados (desligar = usa os plantéis lidos na folha inteira) */
    rosterPass: (process.env.GAME_SHEET_ROSTER_PASS ?? "on") !== "off",
    maxAnalyses: num(process.env.GAME_SHEET_MAX_ANALYSES, 3),
    maxOutputTokens: num(process.env.GAME_SHEET_MAX_OUTPUT_TOKENS, 8192),
    timeBudgetMs: num(process.env.GAME_SHEET_TIME_BUDGET_MS, 50_000),
  };
}

export interface VisionUsage {
  model: string;
  calls: (DeepSeekCallMeta & { purpose: "full" | "score" | "roster" | "recheck"; ok: boolean })[];
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  secondPass: "skipped" | "not_needed" | "done" | "failed";
  /** Leitura da marcha do resultado em recortes ampliados */
  scorePass?: "skipped" | "done" | "failed";
  /** Leitura dos plantéis em recortes ampliados */
  rosterPass?: "skipped" | "done" | "failed";
  /** De onde veio a posição de cada zona recortada: localizada pelo modelo ou por omissão */
  regions?: { runningScore: "model" | "template"; rosterA: "model" | "template"; rosterB: "model" | "template" };
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
type AiPlayer = AiSheet["players"][number];

/** Acumulado de cada equipa no fim de cada período, pelos parciais lidos (para a leitura verificar a marcha). */
export function periodEnds(ai: AiSheet): { A: number[]; B: number[] } {
  const out = { A: [] as number[], B: [] as number[] };
  for (const t of ["A", "B"] as const) {
    let cum = 0;
    for (const p of [...ai.periodScores].sort((a, b) => (a.period ?? 0) - (b.period ?? 0))) {
      const v = p[t];
      if (v === null) break;
      cum += v;
      out[t].push(cum);
    }
  }
  return out;
}

/** Números de camisola lidos em cada plantel. */
export function rosterNumbers(players: AiPlayer[]): { A: number[]; B: number[] } {
  const pick = (t: "A" | "B") => [...new Set(players.filter((p) => p.team === t && p.number !== null).map((p) => p.number as number))];
  return { A: pick("A"), B: pick("B") };
}

/**
 * Junta os cestos lidos nos recortes. As duas metades de um bloco repetem 1–2 linhas, por isso o
 * mesmo cesto pode vir duas vezes: um cesto é identificado por equipa + acumulado e, em caso de
 * conflito, fica o de maior confiança. Reordena por acumulado e refaz o "seq" de cada equipa.
 *
 * O valor, o tipo de lançamento, o período e a região são descartados: o motor calcula o valor pela
 * diferença de acumulados e o período pelos parciais; as coordenadas seriam relativas ao recorte.
 */
export function mergeScoringEvents(base: AiEvent[], extra: AiEvent[]): AiEvent[] {
  const best = new Map<string, AiEvent>();
  for (const e of [...base, ...extra]) {
    if (e.team === null || e.cumulativeScore === null || e.cumulativeScore < 1) continue;
    const k = `${e.team}:${e.cumulativeScore}`;
    const prev = best.get(k);
    if (!prev || (e.confidence ?? 0) > (prev.confidence ?? 0)) best.set(k, e);
  }
  const out: AiEvent[] = [];
  for (const team of ["A", "B"] as const) {
    [...best.values()]
      .filter((e) => e.team === team)
      .sort((a, b) => a.cumulativeScore! - b.cumulativeScore!)
      .forEach((e, i) => out.push({ ...e, seq: i, period: null, points: null, shotType: null, region: null }));
  }
  return out;
}

/**
 * Deteta leituras inventadas: numa marcha real os cestos misturam lances livres, 2 e 3 pontos. Se a
 * equipa tem muitos cestos e quase todos têm o mesmo valor (ex.: tudo +2, com os jogadores a percorrer o
 * plantel por ordem), a leitura é suspeita: baixa a confiança (nada é atribuído a jogadores sem revisão)
 * e acrescenta uma nota.
 */
export function flagSuspiciousEvents(events: AiEvent[]): { events: AiEvent[]; flagged: ("A" | "B")[] } {
  const flagged: ("A" | "B")[] = [];
  const out = events.map((e) => ({ ...e }));
  for (const team of ["A", "B"] as const) {
    const mine = out.filter((e) => e.team === team).sort((a, b) => a.cumulativeScore! - b.cumulativeScore!);
    if (mine.length < 12) continue;
    const counts = new Map<number, number>();
    mine.forEach((e, i) => {
      const d = e.cumulativeScore! - (i === 0 ? 0 : mine[i - 1].cumulativeScore!);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    const top = Math.max(...counts.values());
    if (top / mine.length >= 0.9) {
      flagged.push(team);
      for (const e of mine) {
        e.confidence = Math.min(e.confidence ?? 0.3, 0.3);
        e.note = "Leitura suspeita: quase todos os cestos da equipa têm o mesmo valor";
      }
    }
  }
  return { events: out, flagged };
}

/**
 * Plantéis: usa a leitura dedicada (recorte do quadro) de uma equipa quando traz pelo menos 5
 * jogadores com nome; caso contrário mantém o que veio da leitura da folha inteira.
 */
export function mergeRosters(first: AiPlayer[], pass: AiPlayer[]): AiPlayer[] {
  const out: AiPlayer[] = [];
  for (const t of ["A", "B"] as const) {
    const fromPass = pass.filter((p) => p.team === t && (p.name ?? "").trim() !== "");
    out.push(...(fromPass.length >= 5 ? fromPass : first.filter((p) => p.team === t)));
  }
  return out;
}

const imagePart = (buf: Buffer) => ({ type: "image_url", image_url: { url: dataUrl(buf), detail: imageDetail() } });

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
    // Com a marcha lida à parte, a folha inteira não a lê (inventava marcações): só zonas, parciais e final
    system: buildSystemPrompt(DEFAULT_LAYOUT, input.adminInstructions, input.opencvZones, { includeEvents: !cfg.scorePass }),
    user: [
      imagePart(prepared.buffer),
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

  // ── 1b. Marcha do resultado e plantéis, lidos à parte em recortes ampliados (em paralelo) ──
  usage.scorePass = "skipped";
  usage.rosterPass = "skipped";
  // Com a leitura da marcha por recortes ligada, os cestos vêm só dela: o que a folha inteira
  // devolvesse (se devolvesse) seria inventado.
  if (cfg.scorePass) ai = { ...ai, scoringEvents: [] };
  const remainingForCrops = cfg.timeBudgetMs - (Date.now() - started);
  if ((cfg.scorePass || cfg.rosterPass) && remainingForCrops > 15_000) {
    const reg = {
      runningScore: resolveRegion("runningScore", ai.regions.runningScore),
      rosterA: resolveRegion("rosterA", ai.regions.rosterA),
      rosterB: resolveRegion("rosterB", ai.regions.rosterB),
    };
    usage.regions = { runningScore: reg.runningScore.source, rosterA: reg.rosterA.source, rosterB: reg.rosterB.source };
    const callTimeout = remainingForCrops - 5_000;

    const scoreTask = cfg.scorePass ? (async () => {
      const crops: VisionCrop[] = await scoreBlockCrops(prepared, reg.runningScore.region, scoreBlocksNeeded(ai.finalScore.A, ai.finalScore.B)).catch(() => []);
      if (crops.length === 0) return null;
      return deepseekJSONDetailed<unknown>({
        feature: "folha-jogo",
        model: cfg.model,
        system: buildScorePassSystemPrompt(DEFAULT_LAYOUT, input.adminInstructions),
        user: [
          ...crops.map((c) => imagePart(c.buffer)),
          {
            type: "text",
            text: buildScorePassUserPrompt(input.game, crops.map((c) => c.label), {
              rosterNumbers: rosterNumbers(ai.players), periodEnds: periodEnds(ai), finals: ai.finalScore,
            }),
          },
        ],
        temperature: 0,
        maxTokens: cfg.maxOutputTokens,
        maxRetryTokens: cfg.maxOutputTokens * 2,
        timeoutMs: callTimeout,
      });
    })() : Promise.resolve(null);

    const rosterTask = cfg.rosterPass ? (async () => {
      const [a, b] = await Promise.all([
        regionCrop(prepared, reg.rosterA.region, "quadro dos jogadores da EQUIPA A (a de cima)").catch(() => null),
        regionCrop(prepared, reg.rosterB.region, "quadro dos jogadores da EQUIPA B (a de baixo)").catch(() => null),
      ]);
      const crops = [a, b].filter((c): c is VisionCrop => c !== null);
      if (crops.length === 0) return null;
      return deepseekJSONDetailed<unknown>({
        feature: "folha-jogo",
        model: cfg.model,
        system: buildRosterPassSystemPrompt(DEFAULT_LAYOUT, input.adminInstructions),
        user: [
          ...crops.map((c) => imagePart(c.buffer)),
          { type: "text", text: buildRosterPassUserPrompt(input.game, crops.map((c) => c.label), input.rosterHint) },
        ],
        temperature: 0,
        maxTokens: 4096,
        maxRetryTokens: 8192,
        timeoutMs: callTimeout,
      });
    })() : Promise.resolve(null);

    const [scoreRes, rosterRes] = await Promise.all([scoreTask, rosterTask]);

    if (scoreRes) {
      usage.calls.push({ ...scoreRes.meta, purpose: "score", ok: scoreRes.ok });
      const sp = scoreRes.ok ? AiScorePassSchema.safeParse(scoreRes.data) : null;
      if (sp?.success && sp.data.scoringEvents.length > 0) {
        const flagged = flagSuspiciousEvents(mergeScoringEvents([], sp.data.scoringEvents));
        const notes = flagged.flagged.map((t) => `Marcha da equipa ${t} com aspeto de leitura inventada (cestos todos iguais): reveja-a na folha.`);
        ai = { ...ai, scoringEvents: flagged.events, warnings: [...ai.warnings, ...sp.data.warnings, ...notes].slice(0, 50) };
        usage.scorePass = "done";
      } else {
        usage.scorePass = "failed";
      }
    }
    if (rosterRes) {
      usage.calls.push({ ...rosterRes.meta, purpose: "roster", ok: rosterRes.ok });
      const rp = rosterRes.ok ? AiRosterPassSchema.safeParse(rosterRes.data) : null;
      if (rp?.success && rp.data.players.length > 0) {
        ai = { ...ai, players: mergeRosters(ai.players, rp.data.players), warnings: [...ai.warnings, ...rp.data.warnings].slice(0, 50) };
        usage.rosterPass = "done";
      } else {
        usage.rosterPass = "failed";
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
