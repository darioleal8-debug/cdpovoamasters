import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedPlayerStats } from "./types";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL    = "deepseek-chat";

interface DeepSeekChoice {
  message: { role: string; content: string };
  finish_reason: string;
}
interface DeepSeekResponse {
  choices: DeepSeekChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface RawBoxScore {
  team_name: string | null;
  opponent_name: string | null;
  home_score: number | null;
  away_score: number | null;
  players: Partial<ExtractedPlayerStats & { pdf_name: string; pdf_number: unknown }>[];
  errors: unknown[];
}

function buildSystemPrompt(teamNameOverride?: string): string {
  const teamSection = teamNameOverride
    ? `TEAM TO EXTRACT: The user explicitly confirmed the CD Póvoa team is named "${teamNameOverride}" in this PDF. Extract ALL players from that team section. This is definitive.`
    : `TARGET TEAM — detect in this order:
1. Team named: "CD Póvoa", "Póvoa Masters", "CD Póvoa Masters", "C.D. Póvoa", "*Masters_CDP", "Masters_CDP", "Masters CDP", "CDPM"
2. In Basketball Stats Assistant (basketstatsapp.com) PDFs: the team whose section header is prefixed with an asterisk (*) — that asterisk marks the HOME team.
3. If neither found: extract ALL player rows from the first complete team section.
Do NOT include the opposing team's players.`;

  return `You are a basketball box score parser specialized in Portuguese basketball (Liga INATEL / FPB).

TASK: Extract ONLY the "CD Póvoa" team player statistics.
${teamSection}

── FIELD GOAL COLUMN RULES ─────────────────────────────────────────────────
RULE A — Explicit 2P columns exist ("2PM"/"2PA" or "2PC"/"2PA" or "2P C/A"):
  → Use those directly as fg2_made / fg2_att.
  → Use "3PM"/"3PA" as fg3_made / fg3_att.
  → FGM/FGA (if present) is the combined total — IGNORE it for fg2.

RULE B — Only FGM/FGA + 3PM/3PA (no explicit 2P column):
  → fg2_made = FGM - 3PM, fg2_att = FGA - 3PA.

RULE C — Only FGM/FGA, no 3P column:
  → Treat FGM/FGA as fg2_made/fg2_att, set fg3=0.

── PORTUGUESE FIBA COLUMN ALIASES ──────────────────────────────────────────
• "2P C/A", "2P A/C", "2PC", "2PA": fg2_made / fg2_att
• "3P C/A", "3P A/C", "3PC", "3PA": fg3_made / fg3_att
• "LL C/A", "LL A/C", "LLC", "LLA", "FTM"/"FTA": ft_made / ft_att
• "RO", "R.Of.", "OREB", "ORB": reb_off
• "RD", "R.Def.", "DREB", "DRB": reb_def  (RT/REB = total, skip)
• "ASS", "As.", "AST": ast
• "INT", "Ro.", "STL": stl
• "BLO", "Bl.", "BLK": blk
• "PER", "To.", "TOV", "TO": tov
• "FC", "Fa.", "PF": fouls_committed
• "FS", "PFD", "PFR": fouls_drawn (use 0 if absent)
• "MIN": seconds_played — convert "MM:SS"→MM*60+SS, "MM"→MM*60, "DNP"/"NJ"/"-"→0
• "+/-": plus_minus (null if absent or "-")

── IGNORE THESE COLUMNS ────────────────────────────────────────────────────
SR (screens received), PIR, EFF, CAS, TJS, PUJS, SBJS, FAJS, FJS, HS, L, DL, D, PB, AO, JS, TV, DD, BC, BP, BH — all ignored, not stored.

── VALIDATION ───────────────────────────────────────────────────────────────
pts must equal fg2_made×2 + fg3_made×3 + ft_made. If mismatch, trust the pts column.

── SCORE ────────────────────────────────────────────────────────────────────
Extract final score. Identify which score belongs to CD Póvoa (home_score) and opponent (away_score).

RETURN ONLY compact valid JSON, no markdown, no extra text.`;
}

const OUTPUT_SCHEMA = `{
  "team_name": "<NOME_EQUIPA_NO_PDF>",
  "opponent_name": "<NOME_ADVERSÁRIO_NO_PDF>",
  "home_score": "<PONTOS_CD_POVOA ou null>",
  "away_score": "<PONTOS_ADVERSÁRIO ou null>",
  "players": [
    {
      "pdf_name": "<NOME_DO_JOGADOR_NO_PDF>",
      "pdf_number": "<NÚMERO_CAMISOLA ou null>",
      "seconds_played": "<SEGUNDOS_JOGADOS>",
      "fg2_made": "<2P_CONVERTIDOS>", "fg2_att": "<2P_TENTADOS>",
      "fg3_made": "<3P_CONVERTIDOS>", "fg3_att": "<3P_TENTADOS>",
      "ft_made": "<LL_CONVERTIDOS>",  "ft_att":  "<LL_TENTADOS>",
      "reb_off": "<REB_OFENSIVOS>",   "reb_def": "<REB_DEFENSIVOS>",
      "ast": "<AST>", "stl": "<STL>", "blk": "<BLK>",
      "tov": "<TOV>", "fouls_committed": "<FALTAS>", "fouls_drawn": "<FALTAS_RECEBIDAS>",
      "pts": "<PONTOS>", "plus_minus": "<MAIS_MENOS ou null>"
    }
  ],
  "errors": ["<AVISOS SE HOUVER>"]
}`;

function closeBrackets(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if ((c === "}" || c === "]") && stack.at(-1) === c) stack.pop();
  }
  return s + stack.reverse().join("");
}

function extractJSON(text: string): RawBoxScore {
  const strategies: (() => string)[] = [
    () => text.trim(),
    () => { const m = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/); return m ? m[1] : text.trim(); },
    () => { const s = text.trim(); const a = s.indexOf("{"), b = s.lastIndexOf("}"); return a >= 0 && b > a ? s.slice(a, b + 1) : s; },
    () => { const s = text.trim(); const a = s.indexOf("{"); return closeBrackets(a >= 0 ? s.slice(a) : s); },
  ];
  for (const fn of strategies) {
    try { return JSON.parse(fn()) as RawBoxScore; } catch { /* next */ }
  }
  throw new Error("Não foi possível fazer parse do JSON retornado pelo DeepSeek");
}

function toInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v ?? fallback), 10);
  return isNaN(n) ? fallback : n;
}

function normalize(raw: RawBoxScore): { players: ExtractedPlayerStats[]; errors: string[] } {
  const players: ExtractedPlayerStats[] = (raw.players ?? []).map((p) => ({
    pdf_name:        String(p.pdf_name ?? ""),
    pdf_number:      p.pdf_number != null && String(p.pdf_number) !== "" ? toInt(p.pdf_number, -1) === -1 ? null : toInt(p.pdf_number) : null,
    seconds_played:  toInt(p.seconds_played),
    fg2_made:        toInt(p.fg2_made),
    fg2_att:         toInt(p.fg2_att),
    fg3_made:        toInt(p.fg3_made),
    fg3_att:         toInt(p.fg3_att),
    ft_made:         toInt(p.ft_made),
    ft_att:          toInt(p.ft_att),
    reb_off:         toInt(p.reb_off),
    reb_def:         toInt(p.reb_def),
    ast:             toInt(p.ast),
    stl:             toInt(p.stl),
    blk:             toInt(p.blk),
    tov:             toInt(p.tov),
    fouls_committed: toInt(p.fouls_committed),
    fouls_drawn:     toInt(p.fouls_drawn),
    pts:             toInt(p.pts),
    plus_minus:      p.plus_minus != null ? toInt(p.plus_minus) : null,
  }));
  const errors = Array.isArray(raw.errors) ? raw.errors.map(String) : [];
  return { players, errors };
}

export interface BoxScoreParseResult {
  extracted:    ExtractedPlayerStats[];
  teamName:     string | null;
  opponentName: string | null;
  homeScore:    number | null;
  awayScore:    number | null;
  aiLog:        string;
  errors:       string[];
}

export async function parseBoxScoreWithDeepSeek(pdfText: string, teamNameOverride?: string): Promise<BoxScoreParseResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY não configurada no servidor");

  const teamHint = teamNameOverride
    ? `O utilizador confirmou que a equipa CD Póvoa aparece como "${teamNameOverride}" neste PDF.`
    : `Extrai as estatísticas do boxscore abaixo para a equipa CD Póvoa.`;

  const userContent = `${teamHint}

BOXSCORE:
---
${pdfText.slice(0, 28_000)}
---

IMPORTANTE: O JSON abaixo é apenas a ESTRUTURA do output. Os placeholders em <MAIÚSCULAS> devem ser substituídos pelos valores reais extraídos do BOXSCORE acima. NÃO copies os placeholders — extrai os dados reais do PDF. Inclui TODOS os jogadores encontrados na equipa.

Devolve APENAS JSON válido (sem markdown, sem texto adicional):
${OUTPUT_SCHEMA}`;

  const body = {
    model:      DEEPSEEK_MODEL,
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystemPrompt(teamNameOverride) },
      { role: "user",   content: userContent },
    ],
  };

  console.log(`[import-stats] DeepSeek call — ${pdfText.length} chars`);

  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DeepSeek API ${res.status}: ${txt.slice(0, 300)}`);
  }

  const data = (await res.json()) as DeepSeekResponse;
  const choice = data.choices?.[0];
  if (!choice?.message?.content) throw new Error("DeepSeek: resposta sem conteúdo");

  const content = choice.message.content;
  const tokLog  = data.usage
    ? `${data.usage.prompt_tokens}p + ${data.usage.completion_tokens}c tokens`
    : "tokens: ?";
  console.log(`[import-stats] DeepSeek done — ${tokLog}, finish=${choice.finish_reason}`);

  const raw                  = extractJSON(content);
  const { players, errors }  = normalize(raw);

  const aiLog = [
    tokLog,
    `finish=${choice.finish_reason}`,
    raw.errors?.length ? `ai_errors=${JSON.stringify(raw.errors)}` : null,
  ].filter(Boolean).join(" | ");

  return {
    extracted:    players,
    teamName:     raw.team_name    ? String(raw.team_name)    : null,
    opponentName: raw.opponent_name ? String(raw.opponent_name) : null,
    homeScore:    raw.home_score   != null ? toInt(raw.home_score)  : null,
    awayScore:    raw.away_score   != null ? toInt(raw.away_score)  : null,
    aiLog,
    errors,
  };
}

export async function parseBoxScoreFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  teamNameOverride?: string,
): Promise<BoxScoreParseResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada no servidor. Adiciona a chave em web/.env.local e reinicia.");

  const client = new Anthropic({ apiKey: key });

  const teamHint = teamNameOverride
    ? `TARGET TEAM: The user confirmed the CD Póvoa team appears as "${teamNameOverride}" in this image. Extract ALL players from that section only.`
    : `TARGET TEAM: Extract stats for the CD Póvoa team only. It may appear as: "CD Póvoa", "*Masters_CDP", "Masters_CDP", "Póvoa Masters", "CDPM" or any variant. If section headers have an asterisk (*) prefix, that asterisk marks the HOME team — that is CD Póvoa. Do NOT include the opposing team's players.`;

  const prompt = `You are a basketball statistics extraction specialist. Your task: read this boxscore image with 100% fidelity to what is visually present.

${teamHint}

═══ COLUMN ORDER ════════════════════════════════════════════════════════════════
This is a Basketball Stats Assistant (basketstatsapp.com) boxscore.
Columns appear LEFT TO RIGHT in this EXACT order (29 columns total):

 1:Nº | 2:Name | 3:MIN | 4:PTS | 5:FGM | 6:FGA | 7:FG% | 8:3PM | 9:3PA | 10:3P% | 11:2PM | 12:2PA | 13:2P% | 14:FTM | 15:FTA | 16:FT% | 17:OREB | 18:DREB | 19:REB | 20:AST | 21:TOV | 22:STL | 23:BLK | 24:SR | 25:PF | 26:PFD | 27:PIR | 28:EFF | 29:+/-

Count columns carefully. +/- is the LAST column (29th). PTS is column 4.

═══ CRITICAL WARNINGS ═══════════════════════════════════════════════════════════
⚠ PTS (col 4) and +/- (col 29) are COMPLETELY DIFFERENT VALUES. NEVER confuse them.
⚠ A player with PTS=5 and +/-=14 must have pts=5 and plus_minus=14 — not pts=14.
⚠ 2PM (col 11) and 2PA (col 12) are 2-point field goals, NOT total field goals.
⚠ FGM/FGA (cols 5-6) = combined field goals (2P+3P) — used for reference only.
⚠ OREB=col 17, DREB=col 18, REB=col 19. Read each column separately; do not mix.

═══ FIELD GOAL MAPPING ══════════════════════════════════════════════════════════
fg2_made  = col 11 (2PM)   fg2_att  = col 12 (2PA)
fg3_made  = col 8  (3PM)   fg3_att  = col 9  (3PA)
ft_made   = col 14 (FTM)   ft_att   = col 15 (FTA)
pts       = col 4  (PTS)   — read directly, do NOT calculate
plus_minus = col 29 (+/-)  — read directly, can be negative (e.g. -3)
reb_off   = col 17 (OREB)  reb_def  = col 18 (DREB)

═══ MINUTES ═════════════════════════════════════════════════════════════════════
Convert MIN (col 3) to seconds: "MM:SS" → MM×60+SS. "-" or "DNP" → 0.

═══ EXTRACTION RULES ════════════════════════════════════════════════════════════
1. For each player row, read the value in EACH column strictly left-to-right.
2. Do NOT skip columns. Do NOT assume positions — count from column 1 every row.
3. Blank or "-" cells → 0 (or null for plus_minus and pdf_number).
4. Copy player names and jersey numbers exactly as written in the image.
5. Include ALL players from the CD Póvoa section, including bench players.

IMPORTANT: The JSON structure below uses <PLACEHOLDERS> — replace ALL of them with real values read from the image. Do NOT copy placeholder text.

Return ONLY valid compact JSON, no markdown, no extra text:
${OUTPUT_SCHEMA}`;

  const mediaType = (mimeType === "image/png" ? "image/png"
    : mimeType === "image/webp" ? "image/webp"
    : mimeType === "image/gif"  ? "image/gif"
    : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  let response;
  try {
    response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBuffer.toString("base64") } },
          { type: "text",  text: prompt },
        ],
      }],
    });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("authentication") || msg.includes("invalid") || msg.includes("401")) {
      throw new Error("Chave Anthropic inválida ou expirada. Vai a console.anthropic.com, gera uma nova chave e actualiza ANTHROPIC_API_KEY em web/.env.local.");
    }
    throw err;
  }

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("Claude: resposta sem conteúdo");

  const raw                 = extractJSON(textContent.text);
  const { players, errors } = normalize(raw);
  const usage               = response.usage;
  const tokLog              = `${usage.input_tokens}p+${usage.output_tokens}c`;

  console.log(`[import-stats] Claude vision done — ${tokLog}`);

  return {
    extracted:    players,
    teamName:     raw.team_name     ? String(raw.team_name)     : null,
    opponentName: raw.opponent_name ? String(raw.opponent_name) : null,
    homeScore:    raw.home_score    != null ? toInt(raw.home_score)  : null,
    awayScore:    raw.away_score    != null ? toInt(raw.away_score)  : null,
    aiLog:        `claude-haiku vision ${tokLog}`,
    errors,
  };
}
