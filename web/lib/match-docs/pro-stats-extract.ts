/**
 * Interpretação de folhas de estatísticas profissionais (Tipo B) com o DeepSeek.
 *
 * Estratégia:
 *  1. Preparação: PDF → texto + páginas renderizadas; imagens altas → secções (documents.ts)
 *  2. Extração estruturada (1 chamada, todas as páginas/secções + texto do PDF como referência)
 *  3. Validação do esquema (zod) e normalização por código (colunas variáveis por aplicação)
 *  4. Validação matemática por código (validate.ts)
 *  5. 2.ª passagem DIRIGIDA só às linhas inconsistentes; um valor corrigido só é aceite se
 *     resolver a inconsistência (nunca se força um valor para "fechar contas")
 */
import { deepseekJSONDetailed, type DeepSeekCallMeta, type DeepSeekErrorKind, type MessagePart } from "@/lib/deepseek";
import { hasUsefulText, imagePart, prepareDocument, type PreparedDocument } from "./documents";
import { AiProStatsSchema, aiToProStats, rowToStatLine, STAT_KEYS, type ProStatsData, type Side } from "./pro-stats-schema";
import { playersWithErrors, validateProStats, type MathIssue } from "./validate";
import { z } from "zod";

export function proStatsConfig() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    model: process.env.DEEPSEEK_STATS_MODEL || process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
    maxOutputTokens: num(process.env.PRO_STATS_MAX_OUTPUT_TOKENS, 8192),
    timeBudgetMs: num(process.env.PRO_STATS_TIME_BUDGET_MS, 52_000),
    secondPass: (process.env.PRO_STATS_SECOND_PASS ?? "on") !== "off",
  };
}

export const PRO_STATS_SYSTEM_PROMPT = `És um extrator de estatísticas de basquetebol. Recebes um documento exportado por uma aplicação de estatística (ex.: Pocket Stat, Basketball Stats Assistant, iScore, Easy Stats, FIBA LiveStats) em imagem e/ou texto. Os layouts variam: lê o que existe, sem assumir colunas.

REGRAS ABSOLUTAS
- Nunca inventes valores. Se uma célula não existe, não se lê ou está vazia/"-", devolve null e acrescenta a coluna a "illegible" (só se existir mas for ilegível).
- Ausência de uma estatística NÃO é zero. Só escreve 0 quando o documento mostra 0.
- Copia os números exatamente como aparecem. Não recalcules nem corrijas valores (o sistema valida por código).
- Se for fornecido o TEXTO EXTRAÍDO DO PDF, usa-o como referência exata para os dígitos e a imagem para perceber a estrutura (colunas/linhas).
- Quando a imagem vem dividida em secções, as secções sobrepõem-se ligeiramente: não dupliques linhas.

ESTRUTURA
- Uma entrada em "teams" por equipa com tabela (de jogadores ou só de equipa).
- Indica "side": "home" ou "away" comparando com as equipas do jogo indicadas pelo utilizador. Se a tabela não tiver nome de equipa, identifica-a pelo total de pontos face ao resultado/parciais e explica em "warnings".
- Em "players" põe cada linha de jogador. Linhas agregadas sem jogador (ex.: "Equipa (sem jogador)", "Team") vão com "isTeamRow": true. A linha de totais vai em "totals" (não em players).
- "stats" usa as abreviaturas EXATAS das colunas do documento como chaves e o conteúdo da célula como valor (texto), ex.: {"Min":"14:29","Pts":"11","2P":"1/5","3P":"3/5","LL":"0/0","RO":"0","RD":"0","Res":"0","Ass":"1","Rou":"1","Blo":"0","TO":"2","FC":"0","FS":"0","+/-":"+22","Ef":"5"} ou {"FGM-A":"2-4","2PM-A":"0-0","3PM-A":"2-4","FTM-A":"4-4","Reb Off":"2","Reb Def":"5","Reb":"7","AST":"0","ST":"0","TO":"1","BS":"1","PF":"4","FPF":"1","EFF":"15","PTS":"10"}. Ignora percentagens entre parênteses.
- "number": número da camisola se existir (ex.: "#4 Afonso" → number 4, name "Afonso").
- "periodScores": [{"period":1,"home":16,"away":6}, …] incluindo prolongamentos (period 5, 6…), usando home/away do jogo.
- "finalScore": {"home":46,"away":20} se o documento mostrar o resultado (senão null).
- "confidence" (0–1) global e por linha: baixa quando a imagem está desfocada, cortada ou com reflexos.

Responde APENAS com JSON:
{"app":string|null,"date":string|null,"columnsFound":[string],"teams":[{"name":string|null,"side":"home"|"away"|null,"confidence":number,"players":[{"number":number|null,"name":string,"isTeamRow":boolean,"stats":{…},"illegible":[string],"confidence":number}],"totals":{…}|null}],"periodScores":[…],"finalScore":{"home":number|null,"away":number|null},"confidence":number,"warnings":[string]}`;

export function buildProStatsUserPrompt(game: { home: string; away: string; date?: string | null }, submittingTeam: string | null, doc: PreparedDocument): string {
  const lines = [
    `Jogo: ${game.home} (home/casa) vs ${game.away} (away/fora)${game.date ? `, ${game.date}` : ""}.`,
    submittingTeam ? `Documento submetido pela equipa: ${submittingTeam}.` : "Documento carregado pelo administrador da liga.",
    doc.pages.length ? `Imagens anexas, por ordem: ${doc.pages.map((p) => p.label).join("; ")}.` : "Sem imagens (só texto).",
  ];
  if (hasUsefulText(doc)) {
    lines.push("TEXTO EXTRAÍDO DO PDF (referência exata dos dígitos):");
    doc.textLayer.forEach((t, i) => lines.push(`--- página ${i + 1} ---\n${t.slice(0, 6000)}`));
  }
  lines.push("Extrai TODAS as tabelas de estatísticas e devolve o JSON pedido.");
  return lines.join("\n");
}

const RecheckSchema = z.object({
  rows: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 30) : []), z.array(z.object({
    id: z.string(),
    stats: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.record(z.unknown())),
    note: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 200) : null), z.string().nullable()).optional(),
  }).passthrough())),
});

export interface ProStatsUsage {
  model: string;
  calls: (DeepSeekCallMeta & { purpose: "full" | "recheck"; ok: boolean })[];
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  secondPass: "skipped" | "not_needed" | "done" | "failed";
  images: number;
  usedTextLayer: boolean;
}

export type ProStatsResult =
  | { ok: true; data: ProStatsData; issues: MathIssue[]; usage: ProStatsUsage; raw: unknown; pageCount: number; corrected: string[] }
  | { ok: false; error: string; kind: DeepSeekErrorKind | "invalid_document" | "schema" | "empty"; usage: ProStatsUsage; pageCount: number };

function finish(u: ProStatsUsage, started: number): ProStatsUsage {
  u.totalDurationMs = Date.now() - started;
  u.promptTokens = u.calls.reduce((a, c) => a + (c.promptTokens ?? 0), 0);
  u.completionTokens = u.calls.reduce((a, c) => a + (c.completionTokens ?? 0), 0);
  return u;
}

export async function extractProStats(input: {
  buffer: Buffer;
  mime: string;
  game: { home: string; away: string; date?: string | null };
  submittingTeam: string | null;
  adminInstructions?: string;
}): Promise<ProStatsResult> {
  const cfg = proStatsConfig();
  const started = Date.now();
  const usage: ProStatsUsage = { model: cfg.model, calls: [], totalDurationMs: 0, promptTokens: 0, completionTokens: 0, secondPass: "skipped", images: 0, usedTextLayer: false };

  let doc: PreparedDocument;
  try {
    doc = await prepareDocument(input.buffer, input.mime, { digital: true });
  } catch {
    return { ok: false, kind: "invalid_document", error: "O documento não pôde ser lido (ficheiro corrompido ou formato inválido).", usage, pageCount: 0 };
  }
  if (doc.pages.length === 0 && !hasUsefulText(doc)) {
    return { ok: false, kind: "invalid_document", error: "O PDF não tem páginas legíveis nem texto.", usage, pageCount: doc.pageCount };
  }
  usage.images = doc.pages.length;
  usage.usedTextLayer = hasUsefulText(doc);

  const system = PRO_STATS_SYSTEM_PROMPT + (input.adminInstructions?.trim()
    ? `\n\nINSTRUÇÕES DO ADMINISTRADOR DA LIGA (prioritárias sobre a interpretação, nunca sobre as regras absolutas):\n${input.adminInstructions.trim().slice(0, 2000)}`
    : "");
  const user: MessagePart[] = [
    ...doc.pages.map((p) => imagePart(p.buffer)),
    { type: "text", text: buildProStatsUserPrompt(input.game, input.submittingTeam, doc) },
  ];

  const full = await deepseekJSONDetailed<unknown>({
    model: cfg.model, system, user: doc.pages.length ? user : buildProStatsUserPrompt(input.game, input.submittingTeam, doc),
    temperature: 0, maxTokens: cfg.maxOutputTokens, maxRetryTokens: cfg.maxOutputTokens * 2,
    timeoutMs: Math.max(10_000, cfg.timeBudgetMs - 8_000), transientRetries: 1,
  });
  usage.calls.push({ ...full.meta, purpose: "full", ok: full.ok });
  if (!full.ok) return { ok: false, kind: full.kind, error: full.error, usage: finish(usage, started), pageCount: doc.pageCount };

  const parsed = AiProStatsSchema.safeParse(full.data);
  if (!parsed.success) return { ok: false, kind: "schema", error: "A resposta do modelo não segue o esquema esperado.", usage: finish(usage, started), pageCount: doc.pageCount };
  const data = aiToProStats(parsed.data, input.game);
  data.warnings = [...doc.notes, ...data.warnings].slice(0, 60);
  if (!data.teams.home && !data.teams.away) {
    return { ok: false, kind: "empty", error: "Não foi encontrada nenhuma tabela de estatísticas associável a este jogo.", usage: finish(usage, started), pageCount: doc.pageCount };
  }

  const names = { home: input.game.home, away: input.game.away };
  let issues = validateProStats(data, { names });
  const corrected: string[] = [];

  // ── 2.ª passagem dirigida ──
  const bad = playersWithErrors(issues).slice(0, 15);
  const remaining = cfg.timeBudgetMs - (Date.now() - started);
  if (bad.length === 0) {
    usage.secondPass = "not_needed";
  } else if (cfg.secondPass && remaining > 15_000 && doc.pages.length) {
    const rows = bad.map(({ side, playerId }) => {
      const p = data.teams[side]!.players.find((x) => x.id === playerId)!;
      const probs = issues.filter((i) => i.playerId === playerId).map((i) => i.message);
      return { id: `${side}:${playerId}`, team: side === "home" ? input.game.home : input.game.away, number: p.number, name: p.name, readValues: p.stats, problems: probs };
    });
    const recheck = await deepseekJSONDetailed<unknown>({
      model: cfg.model,
      system: `${PRO_STATS_SYSTEM_PROMPT}\n\nMODO 2.ª LEITURA: volta a ler APENAS as linhas indicadas, célula a célula, e devolve {"rows":[{"id":string,"stats":{<abreviatura da coluna>:<texto da célula>},"note":string|null}]}. Não alteres valores por aritmética: copia o que está escrito.`,
      user: [
        ...doc.pages.map((p) => imagePart(p.buffer)),
        { type: "text", text: `${buildProStatsUserPrompt(input.game, input.submittingTeam, doc)}\n\nLINHAS A RELER (a leitura anterior tem inconsistências matemáticas):\n${JSON.stringify(rows)}` },
      ],
      temperature: 0, maxTokens: 2048, maxRetryTokens: 4096, timeoutMs: remaining - 6_000,
    });
    usage.calls.push({ ...recheck.meta, purpose: "recheck", ok: recheck.ok });
    const rc = recheck.ok ? RecheckSchema.safeParse(recheck.data) : null;
    if (rc?.success) {
      usage.secondPass = "done";
      for (const r of rc.data.rows) {
        const [side, pid] = r.id.split(":") as [Side, string];
        const team = data.teams[side];
        const player = team?.players.find((x) => x.id === pid);
        if (!team || !player) continue;
        const { line } = rowToStatLine(r.stats);
        const candidate = { ...player.stats };
        for (const k of STAT_KEYS) if (line[k] !== null) candidate[k] = line[k];
        const before = issues.filter((i) => i.playerId === pid && i.severity === "error").length;
        const trial = { ...data, teams: { ...data.teams, [side]: { ...team, players: team.players.map((x) => (x.id === pid ? { ...x, stats: candidate } : x)) } } };
        const after = validateProStats(trial, { names }).filter((i) => i.playerId === pid && i.severity === "error").length;
        // Só aceita a releitura se reduzir os erros desse jogador
        if (after < before) {
          player.stats = candidate;
          corrected.push(`${player.name}${r.note ? ` (${r.note})` : ""}`);
          issues = validateProStats(data, { names });
        }
      }
      if (corrected.length) data.warnings.push(`2.ª leitura corrigiu: ${corrected.join(", ")}.`);
    } else {
      usage.secondPass = "failed";
    }
  }

  return { ok: true, data, issues, usage: finish(usage, started), raw: parsed.data, pageCount: doc.pageCount, corrected };
}

/** Estado da importação a partir da validação (igual ao boletim: erros → rever). */
export function proStatsStatus(data: ProStatsData, issues: MathIssue[]): "needs_review" | "ready_to_confirm" {
  if (issues.some((i) => i.severity === "error")) return "needs_review";
  if ((data.aiConfidence ?? 1) < 0.6) return "needs_review";
  const illegible = [data.teams.home, data.teams.away].some((t) => t?.players.some((p) => p.illegible.length > 0));
  return illegible ? "needs_review" : "ready_to_confirm";
}
