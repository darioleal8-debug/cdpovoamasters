/**
 * FASE 3 — análise cruzada DeepSeek das submissões das duas equipas.
 *
 * Recebe os dados JÁ extraídos de todos os documentos (folhas oficiais + estatísticas
 * profissionais, das duas equipas) e as divergências detetadas por código. A IA explica as
 * divergências, sugere resoluções e assinala incoerências que o código não modela (ex.: o
 * mesmo jogador com grafias diferentes). NUNCA altera valores: o resultado é informativo e
 * as validações matemáticas continuam a ser feitas por código.
 */
import { z } from "zod";
import { deepseekJSONDetailed, type DeepSeekCallMeta } from "@/lib/deepseek";
import { proFinal, STAT_KEYS } from "./pro-stats-schema";
import type { AiReview, OfficialInput, ProInput, ReconciliationResult } from "./reconcile";

const ReviewSchema = z.object({
  notes: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 60) : []), z.array(z.object({
    id: z.string().max(120),
    reason: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 400) : null), z.string().nullable()).optional(),
    suggestion: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 400) : null), z.string().nullable()).optional(),
  }).passthrough())),
  findings: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 10) : []), z.array(z.object({
    field: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 80) : "geral"), z.string()),
    description: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 500) : ""), z.string().min(3)),
    severity: z.preprocess((v) => (v === "medium" || v === "high" ? "medium" : "low"), z.enum(["medium", "low"])),
    side: z.preprocess((v) => (v === "home" || v === "away" ? v : null), z.enum(["home", "away"]).nullable()).optional(),
  }).passthrough())),
  assessment: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 800) : null), z.string().nullable()).optional(),
  confidence: z.preprocess((v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v > 1 ? v / 100 : v)) : null), z.number().nullable()).optional(),
});

const SYSTEM = `És o auditor de estatísticas da Liga INATEL de basquetebol. Recebes os dados extraídos (por IA e validados por código) de TODOS os documentos submetidos pelas duas equipas de um jogo: folhas de jogo oficiais (manuscritas pelos árbitros, leitura sujeita a erros) e estatísticas profissionais exportadas de aplicações (fonte prioritária para estatísticas individuais).

A tua tarefa:
1. Para cada divergência listada (pelo seu "id"), explica a causa mais provável ("reason") e sugere a resolução ("suggestion"), em português de Portugal, de forma curta e objetiva.
2. Em "findings", assinala até 6 incoerências adicionais que encontres e que não estejam na lista (ex.: o mesmo jogador com nomes/números diferentes entre documentos, jogador atribuído à equipa errada, parciais trocados entre equipas, resultado invertido).
3. Regras: não inventes dados; uma equipa adversária normalmente NÃO tem as estatísticas individuais da outra — a ausência de uma estatística não é zero nem é divergência; não recalcules valores (o código já valida a matemática).

Responde APENAS com JSON: {"notes":[{"id":string,"reason":string,"suggestion":string}],"findings":[{"field":string,"description":string,"severity":"medium"|"low","side":"home"|"away"|null}],"assessment":string,"confidence":number}`;

function docSummary(d: OfficialInput | ProInput, game: { home: string; away: string }) {
  const who = d.teamSide ? `submetido por ${game[d.teamSide]}` : "carregado pelo admin";
  if (d.docType === "official_sheet") {
    return {
      id: d.importId, tipo: "folha_oficial_manuscrita", origem: who, confianca: d.confidence,
      resultado: d.sheet.final, parciais: d.sheet.periods,
      jogadores: d.analysis.players.map((p) => ({ eq: p.side, n: p.number, nome: p.name, pts: p.points, faltas: p.fouls })),
      completude: { home: d.analysis.teams.home.completeness, away: d.analysis.teams.away.completeness },
    };
  }
  const team = (s: "home" | "away") => {
    const t = d.data.teams[s];
    if (!t) return null;
    return {
      nome_no_documento: t.sheetName, so_totais: t.teamOnly,
      jogadores: t.players.map((p) => ({ n: p.number, nome: p.name, ...Object.fromEntries(STAT_KEYS.filter((k) => p.stats[k] !== null).map((k) => [k, p.stats[k]])) })),
      totais: Object.fromEntries(STAT_KEYS.filter((k) => t.totals[k] !== null).map((k) => [k, t.totals[k]])),
    };
  };
  return {
    id: d.importId, tipo: "estatistica_profissional", app: d.data.app, origem: who, confianca: d.confidence,
    resultado: proFinal(d.data), parciais: d.data.periods, home: team("home"), away: team("away"),
    problemas_detetados_por_codigo: d.issues.filter((i) => i.severity === "error").map((i) => i.message).slice(0, 10),
  };
}

export async function crossCheckWithAI(input: {
  game: { home: string; away: string; date?: string | null };
  official: OfficialInput[];
  pro: ProInput[];
  result: ReconciliationResult;
}): Promise<{ ok: true; review: AiReview; meta: DeepSeekCallMeta } | { ok: false; error: string; meta: DeepSeekCallMeta | null }> {
  const payload = {
    jogo: { casa: input.game.home, fora: input.game.away, data: input.game.date ?? null },
    documentos: [...input.official, ...input.pro].map((d) => docSummary(d, input.game)),
    consolidado: { resultado: input.result.final, parciais: input.result.periods },
    divergencias: input.result.discrepancies.filter((d) => d.origin === "code").map((d) => ({
      id: d.id, campo: d.label, gravidade: d.severity, equipa_casa: d.teamA, equipa_fora: d.teamB, folha_oficial: d.official, proposto: d.chosen, motivo: d.reason,
    })),
    erros_matematicos: input.result.mathIssues.filter((i) => i.docId === "consolidated").map((i) => i.message),
  };
  const r = await deepseekJSONDetailed<unknown>({
    feature: "estatisticas-jogo",
    system: SYSTEM,
    user: JSON.stringify(payload).slice(0, 60_000),
    temperature: 0.1,
    maxTokens: 3072,
    maxRetryTokens: 6144,
    timeoutMs: 35_000,
    transientRetries: 1,
  });
  if (!r.ok) return { ok: false, error: r.error, meta: r.meta };
  const parsed = ReviewSchema.safeParse(r.data);
  if (!parsed.success) return { ok: false, error: "Resposta da análise cruzada fora do esquema", meta: r.meta };
  const review: AiReview = {
    notes: parsed.data.notes.map((n) => ({ id: n.id, reason: n.reason ?? null, suggestion: n.suggestion ?? null })),
    findings: parsed.data.findings.map((f) => ({ field: f.field, description: f.description, severity: f.severity, side: f.side ?? null })),
    assessment: parsed.data.assessment ?? null,
    confidence: parsed.data.confidence ?? null,
  };
  return { ok: true, review, meta: r.meta };
}
