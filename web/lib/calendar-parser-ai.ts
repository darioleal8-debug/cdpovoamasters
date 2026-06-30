/**
 * Parser IA — Calendário Liga INATEL Porto
 *
 * Processo:
 *   1. Normalização do texto / OCR
 *   2. Identificação e normalização de equipas
 *   3. Identificação de jornadas
 *   4. Extração de jogos (com validação)
 *   5. Marcação dos nossos jogos (fuzzy matching)
 *   6. Validação final
 *   7. Output JSON estruturado
 *
 * Garantias:
 *   - max_tokens: 16 384
 *   - Reparação automática de JSON truncado (5 estratégias)
 *   - Recuperação parcial por regex se tudo falhar
 *   - Nunca inventa jogos — devolve "linhas_ambíguas" para o ilegível
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  slugTeamName,
  normalizeTeamName,
  type ParseResult,
  type RawGame,
} from "./calendar-parser";

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

export interface AITeam {
  name: string;
  normalized_name: string;
  ccd_number: string | null;
  contact: string | null;
  home_pavilion: string | null;
  locality: string | null;
}

export interface AIJornada {
  number: number;
  games: number[];
  date_range?: string;
}

/** Jogo no formato INATEL (output novo) */
interface INATELJogo {
  numero: number;
  visitado: string;
  visitante: string;
  data: string | null;
  hora: string | null;
  pavilhao: string;
  local: string;
  is_our_game: boolean;
}

/** Jornada no formato INATEL (output novo) */
interface INATELJornada {
  jornada: number;
  jogos: INATELJogo[];
}

/** Formato completo devolvido pela IA */
interface INATELCalendarResult {
  equipas: Array<{ nome: string }>;
  jornadas: INATELJornada[];
  nossos_jogos: (INATELJogo & { jornada: number })[];
  linhas_ambiguas: string[];
  correccoes: string[];
  erros: string[];
  erro?: { mensagem: string; linhas_afetadas?: unknown[] };
}

export type AIParseResult = ParseResult & {
  corrections: string[];
  _ai_teams: AITeam[];
  _ai_jornadas: AIJornada[];
  _inatel_raw?: INATELCalendarResult;
};

// ═══════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════

function getClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada no .env.local");
  return new Anthropic({ apiKey: key });
}

// ═══════════════════════════════════════════════════════════
// JSON REPAIR
// ═══════════════════════════════════════════════════════════

function closeBrackets(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if ((c === "}" || c === "]") && stack[stack.length - 1] === c) stack.pop();
  }
  return s + stack.reverse().join("");
}

function stripIncompleteItem(s: string): string {
  return s
    .replace(/,\s*\{[^}]*$/, "")
    .replace(/,\s*"[^"]*$/, "")
    .replace(/,\s*$/, "");
}

function extractJSON(text: string): INATELCalendarResult {
  const strategies: Array<() => string> = [
    () => text.trim(),
    () => {
      const md = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      return md ? md[1].trim() : text.trim();
    },
    () => {
      const s = text.trim();
      const start = s.indexOf("{");
      const end   = s.lastIndexOf("}");
      return (start >= 0 && end > start) ? s.slice(start, end + 1) : s;
    },
    () => {
      const s = text.trim();
      const start = s.indexOf("{");
      return closeBrackets(start >= 0 ? s.slice(start) : s);
    },
    () => {
      const s = text.trim();
      const start = s.indexOf("{");
      return closeBrackets(stripIncompleteItem(start >= 0 ? s.slice(start) : s));
    },
  ];

  let lastErr = "";

  for (let i = 0; i < strategies.length; i++) {
    try {
      const candidate = strategies[i]();
      const parsed = JSON.parse(candidate) as INATELCalendarResult;
      if (i >= 3) {
        (parsed.correccoes ??= []).push(
          i === 3
            ? "JSON truncado — brackets reparados"
            : "JSON truncado — item incompleto removido e brackets reparados"
        );
      }
      return normalizeINATEL(parsed);
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }

  // Recuperação por regex — extrai jogos individuais
  const jogoRE =
    /"visitado"\s*:\s*"([^"]+)"[^}]*?"visitante"\s*:\s*"([^"]+)"[^}]*?"data"\s*:\s*"([^"]*)"/g;
  const matches = [...text.matchAll(jogoRE)];
  if (matches.length > 0) {
    console.warn(`[calendar-ai] Recuperação por regex: ${matches.length} jogos`);
    return normalizeINATEL({
      equipas: [],
      jornadas: [{
        jornada: 0,
        jogos: matches.map((m, i) => ({
          numero: i + 1,
          visitado: m[1],
          visitante: m[2],
          data: m[3] || null,
          hora: null,
          pavilhao: "",
          local: "",
          is_our_game: false,
        })),
      }],
      nossos_jogos: [],
      linhas_ambiguas: [`Recuperação parcial por regex — ${matches.length} jogos encontrados`],
      correccoes: [],
      erros: [`JSON inválido — recuperação parcial: ${lastErr.slice(0, 200)}`],
    });
  }

  throw new Error(
    `JSON inválido — não foi possível recuperar dados. ${lastErr.slice(0, 200)}`
  );
}

function normalizeINATEL(r: unknown): INATELCalendarResult {
  const p = (r ?? {}) as Record<string, unknown>;
  return {
    equipas:          Array.isArray(p.equipas)          ? p.equipas as INATELCalendarResult["equipas"] : [],
    jornadas:         Array.isArray(p.jornadas)         ? p.jornadas as INATELJornada[] : [],
    nossos_jogos:     Array.isArray(p.nossos_jogos)     ? p.nossos_jogos as INATELCalendarResult["nossos_jogos"] : [],
    linhas_ambiguas:  Array.isArray(p.linhas_ambiguas)  ? p.linhas_ambiguas as string[] : [],
    correccoes:       Array.isArray(p.correccoes)       ? p.correccoes as string[] : [],
    erros:            Array.isArray(p.erros)            ? p.erros as string[] : [],
    erro:             p.erro as INATELCalendarResult["erro"],
  };
}

// ═══════════════════════════════════════════════════════════
// CONVERTER INATELCalendarResult → AIParseResult
// ═══════════════════════════════════════════════════════════

function fromINATEL(result: INATELCalendarResult, ourTeam: string): AIParseResult {
  const ourSlug = slugTeamName(ourTeam);

  const games: RawGame[] = [];

  for (const jornada of result.jornadas ?? []) {
    for (const jogo of jornada.jogos ?? []) {
      const homeTeam = normalizeTeamName(jogo.visitado ?? "");
      const awayTeam = normalizeTeamName(jogo.visitante ?? "");
      if (!homeTeam || !awayTeam) continue;

      const homeSlug = slugTeamName(homeTeam);
      const awaySlug = slugTeamName(awayTeam);
      const isHome    = homeSlug.includes(ourSlug) || ourSlug.includes(homeSlug.slice(0, 5));
      const isOurGame = jogo.is_our_game != null
        ? jogo.is_our_game
        : (isHome || awaySlug.includes(ourSlug) || ourSlug.includes(awaySlug.slice(0, 5)));

      games.push({
        jornada:     jornada.jornada ?? 0,
        jogo_num:    jogo.numero     ?? games.length + 1,
        home_team:   homeTeam,
        away_team:   awayTeam,
        date_raw:    jogo.data       ?? "",
        date:        jogo.data && jogo.data !== "null" ? jogo.data : null,
        time:        jogo.hora && jogo.hora !== "null" ? jogo.hora : null,
        pavilion:    jogo.pavilhao   ?? "",
        locality:    jogo.local      ?? "",
        is_our_game: Boolean(isOurGame),
        is_home:     Boolean(isHome),
      });
    }
  }

  // Equipas
  const teamMap = new Map<string, AITeam>();

  for (const eq of result.equipas ?? []) {
    const slug = slugTeamName(eq.nome);
    if (!teamMap.has(slug)) {
      teamMap.set(slug, {
        name:           eq.nome,
        normalized_name: slug,
        ccd_number:     null,
        contact:        null,
        home_pavilion:  null,
        locality:       null,
      });
    }
  }
  // Enriquecer com dados dos jogos
  for (const g of games) {
    const hSlug = slugTeamName(g.home_team);
    if (!teamMap.has(hSlug)) {
      teamMap.set(hSlug, { name: g.home_team, normalized_name: hSlug,
                           ccd_number: null, contact: null,
                           home_pavilion: g.pavilion || null, locality: g.locality || null });
    } else {
      const t = teamMap.get(hSlug)!;
      t.home_pavilion ??= g.pavilion || null;
      t.locality      ??= g.locality || null;
    }
    const aSlug = slugTeamName(g.away_team);
    if (!teamMap.has(aSlug)) {
      teamMap.set(aSlug, { name: g.away_team, normalized_name: aSlug,
                           ccd_number: null, contact: null,
                           home_pavilion: null, locality: null });
    }
  }

  const aiTeams = [...teamMap.values()];

  const aiJornadas: AIJornada[] = (result.jornadas ?? []).map((j) => ({
    number: j.jornada,
    games:  j.jogos.map((g) => g.numero),
  }));

  const allTeams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))]
    .filter(Boolean).sort();

  const jornadasFound = games.length ? Math.max(...games.map((g) => g.jornada)) : 0;

  const errors = [
    ...(result.erros ?? []),
    ...(result.erro ? [`Erro crítico: ${result.erro.mensagem}`] : []),
    ...(result.linhas_ambiguas ?? []).map((l) => `Linha ambígua: ${l}`),
  ];

  return {
    games,
    all_teams:      allTeams,
    jornadas_found: jornadasFound,
    errors,
    corrections:    result.correccoes ?? [],
    _ai_teams:      aiTeams,
    _ai_jornadas:   aiJornadas,
    _inatel_raw:    result,
  };
}

// ═══════════════════════════════════════════════════════════
// SISTEMA DE PROMPT — INATEL
// ═══════════════════════════════════════════════════════════

const SYSTEM_INATEL = `
Você é um parser especializado de calendários da Liga INATEL Porto de basquetebol (Portugal), época 2025/2026.
Executa o processo abaixo de forma rigorosa e determinística.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASSO 1 — NORMALIZAÇÃO DO TEXTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Remover quebras de linha incorretas dentro de células
- Corrigir colunas desalinhadas
- Uniformizar datas → YYYY-MM-DD
- Uniformizar horas → HH:MM (ex: "21 :45" → "21:45", "21.45" → "21:45", "21H45" → "21:45")
- Remover espaços duplicados
- Corrigir OCR: "qui," → "qui", "sex," → "sex", "sáb," → "sáb"
- Corrigir acentos: "Povoa" → "Póvoa", "Andre" → "André", "Azeméis" → "Azeméis"
- Se a data não tiver ano: usar 2025 (1ª volta) ou 2026 (2ª volta)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASSO 2 — NORMALIZAÇÃO DE EQUIPAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Criar lista única de equipas. Aplicar mapeamento obrigatório:

NOSSA EQUIPA (identificar qualquer variação):
  "CD Póvoa" / "C.D.Póvoa" / "Póvoa" / "Povoa" / "CD Povoa" / "Póvoa Varzim" / "Povoa Varzim"
  → nome oficial: usar o ourTeam passado no prompt

OUTRAS EQUIPAS (corrigir formatação):
  "C.D." → "CD", "G.D." → "GD", "S.C." → "SC", "A.D." → "AD", "B.C." → "BC"
  "A. D." / "G. D." / "S. C." → remover espaços após ponto
  Espaços duplicados → colapsar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASSO 3 — IDENTIFICAÇÃO DE JORNADAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Extrair número de jornada de cada grupo de jogos
- Marcadores: "JORNADA N", "Nª JORNADA", "ROUND N"
- Se ausente: reconstruir pela ordem sequencial dos jogos
- Cada jornada INATEL Porto tem tipicamente 6 jogos (pode ter 5 ou 7)
- Garantir que nenhuma jornada fica vazia

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASSO 4 — EXTRAÇÃO DOS JOGOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para cada jogo extrair:
  - numero: número sequencial do jogo na jornada
  - visitado: equipa da casa (primeiro nome)
  - visitante: equipa de fora (segundo nome)
  - data: YYYY-MM-DD ou null se ilegível
  - hora: HH:MM ou null se ilegível
  - pavilhao: nome do pavilhão corrigido
  - local: cidade / localidade
  - is_our_game: true se ourTeam é visitado OU visitante

Corrigir automaticamente:
  - Jogos duplicados → manter apenas um
  - Datas impossíveis (ex: 30/02) → registar em erros
  - Nomes de equipas com OCR → corrigir e registar em correccoes
  - Se linha for ilegível → registar em linhas_ambiguas, NUNCA inventar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASSO 5 — IDENTIFICAÇÃO DOS NOSSOS JOGOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Aplicar matching robusto para ourTeam:
  - Correspondência exata (case-insensitive, sem acentos)
  - Se o nome da equipa contiver "Póvoa" ou "Povoa" → is_our_game = true
  - Registar em correccoes se o nome foi corrigido

Campo "nossos_jogos": lista de jogos onde is_our_game = true (com campo jornada incluído)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASSO 6 — VALIDAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes de devolver o JSON, verificar:
  ✓ Todas as jornadas têm pelo menos 1 jogo
  ✓ Nenhum jogo duplicado (mesma data + visitado + visitante)
  ✓ Nenhuma equipa duplicada na lista equipas
  ✓ Nenhum jogo com visitado = visitante
  ✓ nossos_jogos === jogos com is_our_game = true (coerência)

Se houver erros não recuperáveis → registar em campo "erros"
Se houver erro crítico → preencher campo "erro" { mensagem, linhas_afetadas }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Devolver APENAS JSON válido, compacto, sem markdown, sem comentários, sem texto antes ou depois.
Arrays nunca incompletos. Chaves nunca abertas. Vírgulas nunca penduradas.
`.trim();

// ─── Schema JSON (mostrado ao modelo como referência) ─────

const INATEL_SCHEMA = `{
  "equipas": [
    { "nome": "Nome Oficial da Equipa" }
  ],
  "jornadas": [
    {
      "jornada": 1,
      "jogos": [
        {
          "numero": 1,
          "visitado": "Equipa Casa",
          "visitante": "Equipa Fora",
          "data": "YYYY-MM-DD",
          "hora": "HH:MM",
          "pavilhao": "Nome do Pavilhão",
          "local": "Cidade",
          "is_our_game": false
        }
      ]
    }
  ],
  "nossos_jogos": [
    {
      "jornada": 2,
      "numero": 9,
      "visitado": "CD Póvoa Masters",
      "visitante": "Adversário",
      "data": "YYYY-MM-DD",
      "hora": "HH:MM",
      "pavilhao": "Pavilhão",
      "local": "Cidade",
      "is_our_game": true
    }
  ],
  "linhas_ambiguas": ["texto da linha ilegível"],
  "correccoes": ["correção aplicada (antes → depois)"],
  "erros": ["descrição do erro não recuperável"]
}`;

// ═══════════════════════════════════════════════════════════
// MODO A — Excel pré-processado
// ═══════════════════════════════════════════════════════════

export async function parseExcelWithAI(
  csvTable: string,
  ourTeam = "CD Póvoa Masters",
  apiKey?: string
): Promise<AIParseResult> {
  const client = getClient(apiKey);
  const lines  = csvTable.split("\n").length;
  console.log(`[calendar-ai] parseExcelWithAI — ${lines} linhas, ${csvTable.length} chars`);

  const userContent = `ourTeam: "${ourTeam}"

TABELA CSV (Liga INATEL Porto — já filtrada, sem Taça/Contactos/Equipamentos):
Colunas: Jornada | Jogo Nº | Visitado (casa) | Visitante (fora) | Data | Hora | Pavilhão | Local
---
${csvTable}
---

Executa os 6 passos do sistema e devolve APENAS este JSON (sem markdown):
${INATEL_SCHEMA}`;

  const msg = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 16384,
    system:     SYSTEM_INATEL,
    messages:   [{ role: "user", content: userContent }],
  });

  const content = msg.content[0];
  if (content.type !== "text") throw new Error("Resposta inesperada da IA");

  if (msg.stop_reason === "max_tokens") {
    console.warn("[calendar-ai] max_tokens atingido — a reparar JSON...");
  }

  let result = extractJSON(content.text);

  // Segunda passagem se 0 jogos
  if (result.jornadas.length === 0 || result.jornadas.every(j => j.jogos.length === 0)) {
    console.warn("[calendar-ai] 0 jogos na 1ª passagem, a tentar 2ª passagem...");
    const retry = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 16384,
      system:     SYSTEM_INATEL,
      messages: [
        { role: "user",      content: userContent },
        { role: "assistant", content: content.text },
        {
          role: "user",
          content:
            `A tua resposta tem 0 jogos em "jornadas[].jogos". ` +
            `Cada linha da tabela CSV (exceto o cabeçalho) é UM jogo. ` +
            `Extrai TODOS os jogos, agrupa por jornada, e devolve o JSON completo.`,
        },
      ],
    });
    const r2 = retry.content[0];
    if (r2.type === "text") {
      try {
        const result2 = extractJSON(r2.text);
        const count2 = result2.jornadas.reduce((n, j) => n + j.jogos.length, 0);
        if (count2 > 0) {
          console.log(`[calendar-ai] 2ª passagem: ${count2} jogos`);
          result = result2;
        }
      } catch { /* manter 1ª passagem */ }
    }
  }

  const count = result.jornadas.reduce((n, j) => n + j.jogos.length, 0);
  console.log(`[calendar-ai] parseExcelWithAI: ${count} jogos em ${result.jornadas.length} jornadas`);

  return fromINATEL(result, ourTeam);
}

// ═══════════════════════════════════════════════════════════
// MODO B — PDF / texto corrido
// ═══════════════════════════════════════════════════════════

const MAX_CHARS = 80_000;

function chunkByJornada(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts = text.split(/(?=(?:\d+[ªº]?\s+JORNADA|JORNADA\s+\d+))/i);
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    if ((current + part).length > MAX_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = part;
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, MAX_CHARS)];
}

function mergeINATEL(results: INATELCalendarResult[]): INATELCalendarResult {
  if (results.length === 1) return results[0];

  const jornadas: INATELJornada[]  = [];
  const equipas: INATELCalendarResult["equipas"] = [];
  const nossos: INATELCalendarResult["nossos_jogos"] = [];
  const ambiguas: string[] = [];
  const correccoes: string[] = [];
  const erros: string[] = [];
  const seenJ  = new Set<number>();
  const seenEq = new Set<string>();
  const seenJogo = new Set<string>();

  for (const r of results) {
    for (const eq of r.equipas ?? []) {
      const key = eq.nome.toLowerCase();
      if (!seenEq.has(key)) { seenEq.add(key); equipas.push(eq); }
    }
    for (const jornada of r.jornadas ?? []) {
      if (!seenJ.has(jornada.jornada)) {
        seenJ.add(jornada.jornada);
        jornadas.push(jornada);
      }
    }
    for (const nj of r.nossos_jogos ?? []) {
      const key = `${nj.data}|${nj.visitado}|${nj.visitante}`;
      if (!seenJogo.has(key)) { seenJogo.add(key); nossos.push(nj); }
    }
    ambiguas.push(...(r.linhas_ambiguas ?? []));
    correccoes.push(...(r.correccoes ?? []));
    erros.push(...(r.erros ?? []));
  }

  jornadas.sort((a, b) => a.jornada - b.jornada);
  nossos.sort((a, b) => a.jornada - b.jornada || a.numero - b.numero);

  return { equipas, jornadas, nossos_jogos: nossos,
           linhas_ambiguas: ambiguas, correccoes, erros };
}

export async function parseCalendarWithAI(
  rawText: string,
  ourTeam = "CD Póvoa Masters",
  apiKey?: string
): Promise<AIParseResult> {
  const client = getClient(apiKey);
  const chunks = chunkByJornada(rawText.trim());
  const results: INATELCalendarResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkNote = chunks.length > 1 ? `[Fragmento ${i + 1}/${chunks.length}]\n` : "";
    const userContent = `${chunkNote}ourTeam: "${ourTeam}"

TEXTO DO DOCUMENTO (usa APENAS a secção Liga — ignora Taça, Contactos, Equipamentos):
---
${chunks[i]}
---

Executa os 6 passos e devolve APENAS este JSON (sem markdown):
${INATEL_SCHEMA}`;

    const msg = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 16384,
      system:     SYSTEM_INATEL,
      messages:   [{ role: "user", content: userContent }],
    });

    const content = msg.content[0];
    if (content.type !== "text") throw new Error(`Chunk ${i + 1}: resposta inesperada`);
    if (msg.stop_reason === "max_tokens") {
      console.warn(`[calendar-ai] Chunk ${i + 1}: max_tokens — a reparar...`);
    }

    results.push(extractJSON(content.text));
  }

  const merged = mergeINATEL(results);
  return fromINATEL(merged, ourTeam);
}

// ═══════════════════════════════════════════════════════════
// REPORT & SQL
// ═══════════════════════════════════════════════════════════

export interface CalendarReport {
  teams: AITeam[];
  games: {
    jornada: number; jogo_num: number;
    home_team: string; away_team: string;
    date: string | null; time: string | null;
    pavilion: string; locality: string;
    is_our_game: boolean; is_home: boolean;
  }[];
  jornadas: AIJornada[];
  summary: {
    jornadas_count: number; total_games: number;
    our_games: number; total_teams: number;
    games_with_date: number; games_without_date: number;
  };
  errors: string[];
  corrections: string[];
  raw?: INATELCalendarResult;
}

export function buildReport(result: AIParseResult): CalendarReport {
  return {
    teams: result._ai_teams ?? [],
    games: result.games.map((g) => ({
      jornada: g.jornada, jogo_num: g.jogo_num,
      home_team: g.home_team, away_team: g.away_team,
      date: g.date, time: g.time,
      pavilion: g.pavilion, locality: g.locality,
      is_our_game: g.is_our_game, is_home: g.is_home,
    })),
    jornadas: result._ai_jornadas ?? [],
    summary: {
      jornadas_count:     result.jornadas_found,
      total_games:        result.games.length,
      our_games:          result.games.filter((g) => g.is_our_game).length,
      total_teams:        (result._ai_teams ?? []).length,
      games_with_date:    result.games.filter((g) => g.date).length,
      games_without_date: result.games.filter((g) => !g.date).length,
    },
    errors:      result.errors,
    corrections: result.corrections ?? [],
    raw:         result._inatel_raw,
  };
}

export function generateSQL(
  report: CalendarReport,
  seasonId: string,
  ourTeamName: string
): string {
  const esc = (s: string | null | undefined) =>
    s ? `'${s.replace(/'/g, "''")}'` : "NULL";

  const lines = [
    "-- CD Póvoa Masters — Calendário INATEL importado",
    `-- Gerado: ${new Date().toISOString()}`,
    `-- Nossos jogos: ${report.summary.our_games} / Total: ${report.summary.total_games}`,
    "", "BEGIN;",
    "", "-- EQUIPAS",
  ];

  for (const t of report.teams) {
    const isOurs = t.normalized_name === slugTeamName(ourTeamName);
    lines.push(
      `INSERT INTO league_teams (name, normalized_name, home_pavilion, locality, ccd_number, is_our_team)` +
      ` VALUES (${esc(t.name)}, ${esc(t.normalized_name)}, ${esc(t.home_pavilion)},` +
      ` ${esc(t.locality)}, ${esc(t.ccd_number)}, ${isOurs})` +
      ` ON CONFLICT (normalized_name) DO UPDATE SET` +
      ` home_pavilion = COALESCE(EXCLUDED.home_pavilion, league_teams.home_pavilion),` +
      ` locality = COALESCE(EXCLUDED.locality, league_teams.locality);`
    );
  }

  lines.push("", "-- JOGOS NOSSOS");
  for (const g of report.games) {
    if (!g.is_our_game || !g.date) continue;
    const opp   = g.is_home ? g.away_team : g.home_team;
    const loc   = [g.pavilion, g.locality].filter(Boolean).join(" — ");
    const title = `J${g.jornada} • ${ourTeamName} vs ${opp} (${g.is_home ? "Casa" : "Fora"})`;
    lines.push(
      `INSERT INTO events (season_id, type, title, location, event_date, event_time, opponent)` +
      ` VALUES ('${seasonId}', 'jogo', ${esc(title)}, ${esc(loc)}, '${g.date}',` +
      ` '${g.time ?? "00:00"}', ${esc(opp)})` +
      ` ON CONFLICT DO NOTHING;`
    );
  }

  lines.push("", "COMMIT;");
  return lines.join("\n");
}
