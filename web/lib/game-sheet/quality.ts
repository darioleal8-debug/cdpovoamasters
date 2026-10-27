/**
 * Qualidade de uma leitura de boletim — para escolher a melhor entre várias fotografias da mesma folha.
 *
 * Combina a avaliação visual do modelo (legibilidade, folha inteira) com indicadores
 * calculados pelo motor determinístico: quanto da marcha foi lido, quantos pontos ficaram
 * atribuídos, confiança média das marcações e consistência com parciais/resultado.
 * O modelo NUNCA decide sozinho: a maior parte do peso vem do que o código consegue verificar.
 */
import { analyzeSheet, type Analysis } from "./engine";
import type { SheetData } from "./schema";

export interface ImageQualityInput {
  legibility: number | null;
  wholeSheetVisible: boolean | null;
  issues: string[];
}

export interface ReadingQuality {
  /** 0–100 */
  score: number;
  components: {
    legibility: number;
    runningCoverage: number;
    attributedRatio: number;
    eventConfidence: number;
    consistency: number;
  };
  errors: number;
  warnings: number;
  /** Explicação curta em português para o admin */
  summary: string[];
}

const WEIGHTS = {
  legibility: 0.2,
  runningCoverage: 0.25,
  attributedRatio: 0.25,
  eventConfidence: 0.1,
  consistency: 0.2,
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function scoreReading(
  sheet: SheetData,
  imageQuality: ImageQualityInput | null,
  analysis: Analysis = analyzeSheet(sheet),
): ReadingQuality {
  const errors = analysis.issues.filter((i) => i.severity === "error").length;
  const warnings = analysis.issues.filter((i) => i.severity === "warning").length;

  const finalTotal = (sheet.final.home ?? 0) + (sheet.final.away ?? 0);
  const runningTotal = (analysis.teams.home.runningLast ?? 0) + (analysis.teams.away.runningLast ?? 0);
  const attributed = analysis.teams.home.attributed + analysis.teams.away.attributed;

  const runningCoverage = finalTotal > 0 ? clamp01(runningTotal / finalTotal) : 0;
  const attributedRatio = finalTotal > 0 ? clamp01(attributed / finalTotal) : 0;

  const confs = sheet.events.filter((e) => !e.voided).map((e) => (e.userVerified ? 1 : e.confidence ?? 0));
  const eventConfidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;

  // Erros materiais (ex.: parciais ≠ final, marcha acima do final) pesam muito
  const consistency = errors > 0 ? 0 : clamp01(1 - warnings * 0.05);

  let legibility = imageQuality?.legibility ?? sheet.aiConfidence ?? 0.5;
  if (imageQuality?.wholeSheetVisible === false) legibility *= 0.7;
  legibility = clamp01(legibility);

  const components = { legibility, runningCoverage, attributedRatio, eventConfidence, consistency };
  let score = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * components[k as keyof typeof components], 0) * 100;
  // Sem resultado final legível a leitura não serve para aplicar ao jogo
  if (sheet.final.home === null || sheet.final.away === null) score = Math.min(score, 20);
  score = Math.round(score * 10) / 10;

  const summary: string[] = [];
  summary.push(finalTotal > 0 ? `marcha lida: ${pct(runningCoverage)} dos pontos` : "resultado final não lido");
  if (finalTotal > 0) summary.push(`pontos atribuídos a jogadores: ${pct(attributedRatio)}`);
  if (confs.length) summary.push(`confiança média das marcações: ${pct(eventConfidence)}`);
  summary.push(errors > 0 ? `${errors} erro(s) de consistência` : warnings > 0 ? `${warnings} aviso(s)` : "consistente com parciais e resultado");
  if (imageQuality?.legibility != null) summary.push(`legibilidade da imagem: ${pct(imageQuality.legibility)}`);
  if (imageQuality?.wholeSheetVisible === false) summary.push("folha incompleta no enquadramento");
  for (const issue of (imageQuality?.issues ?? []).slice(0, 3)) summary.push(issue);

  return { score, components, errors, warnings, summary };
}

export interface RankableCandidate {
  key: string;
  quality: ReadingQuality | null;
  analyzedAt: string | null;
}

/** Melhor candidato: maior pontuação; empate → menos erros → análise mais recente. */
export function pickBest<T extends RankableCandidate>(candidates: T[]): T | null {
  const scored = candidates.filter((c) => c.quality !== null);
  if (scored.length === 0) return null;
  return [...scored].sort((a, b) =>
    b.quality!.score - a.quality!.score ||
    a.quality!.errors - b.quality!.errors ||
    (b.analyzedAt ?? "").localeCompare(a.analyzedAt ?? ""),
  )[0];
}
