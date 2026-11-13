/**
 * Deteção automática do tipo de documento (folha oficial manuscrita vs estatística profissional).
 *
 * Problema que resolve: o tipo era decidido pelo que o utilizador escolhia no upload (ou, nas fotos
 * submetidas e em "Analisar todas as folhas", assumido como folha oficial). Uma captura de ecrã de
 * Pocket Stat lida como folha FIBA manuscrita devolve uma leitura vazia (sem marcha, sem pontos por
 * jogador). Aqui o conteúdo decide: primeiro por código (camada de texto de PDFs), depois por uma
 * chamada curta ao DeepSeek. Em caso de dúvida/falha mantém-se o tipo declarado — nunca se adivinha.
 */
import { deepseekJSONDetailed } from "@/lib/deepseek";
import { hasUsefulText, imagePart, prepareDocument } from "./documents";

export type DocKind = "official_sheet" | "pro_stats";

export interface Classification {
  kind: DocKind | null;
  confidence: number;
  method: "text_layer" | "vision" | "none";
  app?: string | null;
  reason?: string;
}

/** Cabeçalhos típicos de tabelas de estatística exportadas por aplicações (PT / EN). */
const HEADER_TOKENS = [
  /\bfgm-?a\b/i, /\b2pm-?a\b/i, /\b3pm-?a\b/i, /\bftm-?a\b/i, /\breb\s*off\b/i, /\breb\s*def\b/i,
  /\bfpf\b/i, /\beff\b/i, /\bpts\b/i, /\bast\b/i, /\b2pc\b/i, /\b3pc\b/i, /\bllc\b/i, /\bplayer\b/i, /\bjogador\b/i, /\btotals?\b/i,
];

/** ≥ 5 cabeçalhos distintos num texto = tabela de estatísticas (uma folha FIBA não os tem). */
export function looksLikeStatsText(text: string): boolean {
  return HEADER_TOKENS.filter((re) => re.test(text)).length >= 5;
}

export const CLASSIFY_SYSTEM_PROMPT = `Classificas documentos de basquetebol. Responde APENAS com JSON:
{"type":"pro_stats"|"official_sheet"|"other","confidence":number,"app":string|null,"reason":string}

- "pro_stats": tabela DIGITAL de estatísticas (captura de ecrã, exportação ou PDF de uma aplicação como Pocket Stat, Basketball Stats Assistant, iScore, FIBA LiveStats): texto uniforme, uma linha por jogador e colunas com abreviaturas (FGM-A, 2PM-A, 3PM-A, FTM-A, Reb, AST, ST, TO, BS, PF, EFF, PTS, Min, Pts…) e normalmente uma linha de totais. Pode ter fundo escuro.
- "official_sheet": folha de jogo oficial (modelo FIBA), normalmente manuscrita e fotografada: grelhas de marcação, "marcha do resultado" (1–160), quadro de faltas, quadros de cronometragem, assinaturas, nomes de árbitros.
- "other": qualquer outra coisa (foto do jogo, documento ilegível).
"confidence" 0–1. "reason": uma frase curta. Nunca leias nem devolvas estatísticas — só classifica.`;

export interface ClassifyInput {
  buffer: Buffer;
  mime: string;
  /** Tipo escolhido pelo utilizador (pode estar errado); usado só como desempate/fallback. */
  declared?: DocKind | null;
}

export async function classifyDocument(input: ClassifyInput): Promise<Classification> {
  if (!process.env.DEEPSEEK_API_KEY && input.mime !== "application/pdf") {
    return { kind: null, confidence: 0, method: "none", reason: "sem chave DeepSeek" };
  }
  let doc;
  try {
    // Uma só página reduzida chega para classificar (barato e rápido)
    doc = await prepareDocument(input.buffer, input.mime, { digital: true });
  } catch {
    return { kind: null, confidence: 0, method: "none", reason: "documento ilegível" };
  }

  // 1. PDF com camada de texto: decisão por código, sem custo de API
  if (hasUsefulText(doc) && doc.textLayer.some((t) => looksLikeStatsText(t))) {
    return { kind: "pro_stats", confidence: 0.95, method: "text_layer", reason: "cabeçalhos de estatística na camada de texto" };
  }
  if (!doc.pages.length || !process.env.DEEPSEEK_API_KEY) {
    return { kind: null, confidence: 0, method: "none", reason: "sem imagens para classificar" };
  }

  // 2. Classificação visual (primeira página/secção; low detail chega para distinguir o aspeto)
  const r = await deepseekJSONDetailed<{ type?: string; confidence?: number; app?: string | null; reason?: string }>({
    feature: "estatisticas-jogo",
    model: process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
    system: CLASSIFY_SYSTEM_PROMPT,
    user: [
      imagePart(doc.pages[0].buffer, "auto"),
      { type: "text", text: "Classifica este documento e devolve o JSON pedido." },
    ],
    temperature: 0, maxTokens: 300, maxRetryTokens: 600, timeoutMs: 15_000, transientRetries: 1,
  });
  if (!r.ok) return { kind: null, confidence: 0, method: "none", reason: r.error };

  const type = r.data.type === "pro_stats" || r.data.type === "official_sheet" ? r.data.type : null;
  const c = typeof r.data.confidence === "number" ? Math.max(0, Math.min(1, r.data.confidence)) : 0;
  return { kind: type, confidence: c, method: "vision", app: r.data.app ?? null, reason: r.data.reason?.slice(0, 200) };
}

/** Confiança mínima para sobrepor o tipo declarado pelo utilizador. */
export const OVERRIDE_CONFIDENCE = 0.75;

/**
 * Tipo final a usar: o detetado (se confiante), senão o declarado, senão folha oficial.
 * `changed` indica que o conteúdo contradiz o que o utilizador escolheu.
 */
export async function resolveDocKind(input: ClassifyInput): Promise<{ kind: DocKind; changed: boolean; classification: Classification }> {
  const declared = input.declared ?? "official_sheet";
  const classification = await classifyDocument(input);
  if (classification.kind && classification.confidence >= OVERRIDE_CONFIDENCE) {
    return { kind: classification.kind, changed: classification.kind !== declared, classification };
  }
  return { kind: declared, changed: false, classification };
}

// ─── Fotografia de jogo vs documento (capturas de estatísticas, folhas, tabelas) ───────────────

export const PHOTO_SYSTEM_PROMPT = `Distingues fotografias de um jogo de basquetebol de documentos. Responde APENAS com JSON:
{"type":"game_photo"|"document","confidence":number,"reason":string}

- "game_photo": fotografia real tirada num pavilhão/campo: jogadores, equipa, bola, cesto, banco, bancada, grupo de atletas.
- "document": captura de ecrã de uma aplicação, tabela de estatísticas, folha de jogo (manuscrita ou impressa), resultado/placard digital, ou qualquer imagem dominada por texto, números ou tabelas.
Nunca leias nem devolvas os valores — só classifica. "confidence" 0–1.`;

/** Confiança mínima para tratar uma imagem como documento (e não como fotografia do jogo). */
export const DOCUMENT_PHOTO_CONFIDENCE = 0.75;

/**
 * true = é um documento (não serve como fotografia do jogo); false = fotografia; null = não foi possível
 * decidir (sem chave, erro de API…) — quem chama deve aceitar a foto (nunca bloquear por falha técnica).
 */
export async function isDocumentNotPhoto(buffer: Buffer, mime: string): Promise<boolean | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  try {
    const doc = await prepareDocument(buffer, mime, { digital: true });
    if (!doc.pages.length) return null;
    const r = await deepseekJSONDetailed<{ type?: string; confidence?: number }>({
    feature: "estatisticas-jogo",
      model: process.env.DEEPSEEK_VISION_MODEL || "deepseek-flash",
      system: PHOTO_SYSTEM_PROMPT,
      user: [imagePart(doc.pages[0].buffer, "auto"), { type: "text", text: "Classifica esta imagem e devolve o JSON pedido." }],
      temperature: 0, maxTokens: 200, maxRetryTokens: 400, timeoutMs: 15_000, transientRetries: 1,
    });
    if (!r.ok) return null;
    if (r.data.type !== "document" && r.data.type !== "game_photo") return null;
    const c = typeof r.data.confidence === "number" ? r.data.confidence : 0;
    return r.data.type === "document" && c >= DOCUMENT_PHOTO_CONFIDENCE;
  } catch {
    return null;
  }
}
