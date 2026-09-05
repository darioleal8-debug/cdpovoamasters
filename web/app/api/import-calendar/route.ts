import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  parsePDFText,
  validateParseResult,
  buildImportPayload,
  slugTeamName,
  detectJornada,
  normalizeTeamName,
  parseDate,
  parseTime,
  type RawGame,
} from "@/lib/calendar-parser";
import {
  parseCalendarWithAI,
  parseExcelWithAI,
  buildReport,
  generateSQL,
  type AITeam,
  type AIParseResult,
} from "@/lib/calendar-parser-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Helpers ──────────────────────────────────────────────

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

function fail(message: string, detail?: unknown, status = 400) {
  console.error("[import-calendar]", message, detail ?? "");
  return NextResponse.json(
    { success: false, error: message, errors: [message], detail: String(detail ?? "") },
    { status }
  );
}

// ─── Auth helper ──────────────────────────────────────────
async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}

// ─── Normalização de cabeçalhos ───────────────────────────

function normHeader(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palavras-chave que marcam o FIM da secção Liga
const STOP_KEYWORDS = [
  "taca", "tаça", "contactos", "contatos", "equipamentos",
  "material", "arbitros", "árbitros", "delegados",
];

// Palavras-chave que identificam a secção Liga
const LIGA_KEYWORDS = ["liga", "jogos", "campeonato"];

// Colunas esperadas no cabeçalho INATEL
const INATEL_COLS: Record<string, string[]> = {
  jogo_num:  ["jogo no", "jogo n", "jogo num", "no", "n."],
  home_team: ["visitado", "casa", "equipa casa"],
  away_team: ["visitante", "fora", "equipa fora"],
  date:      ["data"],
  time:      ["hora"],
  pavilion:  ["pavilhao", "paviliao", "recinto", "local jogo"],
  locality:  ["local", "localidade", "cidade"],
};

// ─── Pré-processamento Excel: encontra secção Liga ────────

interface LigaSection {
  csvTable: string;                          // tabela limpa para IA
  rows: Array<{                              // rows estruturados para regex parser
    jornada: number;
    jogo_num: number | null;
    home_team: string;
    away_team: string;
    date_raw: string;
    time_raw: string;
    pavilion: string;
    locality: string;
  }>;
  sheetUsed: string;
  sectionsSkipped: string[];
  warnings: string[];
}

function findColIndex(headerCells: string[], synonyms: string[]): number {
  for (let i = 0; i < headerCells.length; i++) {
    if (synonyms.some((s) => headerCells[i].includes(s))) return i;
  }
  return -1;
}

function extractLigaSection(
  rawRows: unknown[][],
  sheetName: string
): LigaSection | null {
  const warnings: string[] = [];
  const sectionsSkipped: string[] = [];

  // ── 1. Encontrar cabeçalho com colunas INATEL ────────────
  let headerIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(60, rawRows.length); i++) {
    const cells = rawRows[i].map(normHeader);
    const homeIdx = findColIndex(cells, INATEL_COLS.home_team);
    const awayIdx = findColIndex(cells, INATEL_COLS.away_team);

    if (homeIdx >= 0 && awayIdx >= 0) {
      headerIdx = i;
      colMap = {
        jogo_num:  findColIndex(cells, INATEL_COLS.jogo_num),
        home_team: homeIdx,
        away_team: awayIdx,
        date:      findColIndex(cells, INATEL_COLS.date),
        time:      findColIndex(cells, INATEL_COLS.time),
        pavilion:  findColIndex(cells, INATEL_COLS.pavilion),
        locality:  findColIndex(cells, INATEL_COLS.locality),
      };
      break;
    }
  }

  if (headerIdx < 0) return null;

  // ── 2. Verificar se estamos dentro da secção Liga ─────────
  // (Verificar as linhas anteriores ao cabeçalho)
  const preRows = rawRows.slice(0, headerIdx).map((r) => r.join(" ").toLowerCase());
  const foundLiga = preRows.some((r) => LIGA_KEYWORDS.some((k) => r.includes(k)));
  const foundStop = preRows.some((r) => STOP_KEYWORDS.some((k) => r.includes(k)));

  if (foundStop && !foundLiga) {
    // O cabeçalho está dentro de outra secção (ex: Taça também tem a mesma estrutura)
    warnings.push(`Cabeçalho em ${sheetName} pode ser de outra secção — a ignorar`);
    return null;
  }

  // ── 3. Extrair linhas de jogo ──────────────────────────────
  const get = (row: unknown[], key: string): string => {
    const idx = colMap[key] ?? -1;
    return idx >= 0 ? String(row[idx] ?? "").trim() : "";
  };

  const csvLines: string[] = [
    "Jornada,Jogo Nº,Visitado,Visitante,Data,Hora,Pavilhão,Local",
  ];
  const rows: LigaSection["rows"] = [];
  let currentJornada = 0;

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowStr = row.map((c) => String(c ?? "")).join(" ").trim();
    const rowNorm = rowStr.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    if (!rowNorm.replace(/[\s,]+/g, "")) continue; // skip empty

    // Stop at other sections
    if (STOP_KEYWORDS.some((k) => rowNorm.includes(k))) {
      sectionsSkipped.push(rowStr.slice(0, 40));
      break;
    }

    // Detect jornada header
    const j = detectJornada(rowStr);
    if (j !== null) {
      currentJornada = j;
      continue;
    }

    // Must have home AND away team
    const homeRaw = get(row, "home_team");
    const awayRaw = get(row, "away_team");
    if (!homeRaw || !awayRaw) continue;

    // Skip header-like rows (repeated column names)
    if (
      normHeader(homeRaw).includes("visitad") ||
      normHeader(homeRaw).includes("casa")
    ) continue;

    const dateRaw  = get(row, "date");
    const timeRaw  = get(row, "time");
    const pavilion = get(row, "pavilion");
    const locality = get(row, "locality");
    const jogoNum  = get(row, "jogo_num");

    // Build CSV line (escape commas)
    const esc = (s: string) => s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
    csvLines.push(
      [
        String(currentJornada || ""),
        esc(jogoNum),
        esc(homeRaw),
        esc(awayRaw),
        esc(dateRaw),
        esc(timeRaw),
        esc(pavilion),
        esc(locality),
      ].join(",")
    );

    rows.push({
      jornada:   currentJornada,
      jogo_num:  jogoNum ? parseInt(jogoNum, 10) || null : null,
      home_team: homeRaw,
      away_team: awayRaw,
      date_raw:  dateRaw,
      time_raw:  timeRaw,
      pavilion,
      locality,
    });
  }

  if (rows.length === 0) return null;

  return {
    csvTable: csvLines.join("\n"),
    rows,
    sheetUsed: sheetName,
    sectionsSkipped,
    warnings,
  };
}

// ─── Extrai Liga de todas as folhas do workbook ───────────

async function extractExcelLiga(buffer: Buffer): Promise<{
  liga: LigaSection | null;
  allSheetsText: string;
  warnings: string[];
}> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  const warnings: string[] = [];
  const sheetTexts: string[] = [];

  // Tentar primeiro folhas cujo nome contém "liga" ou "jogo"
  const priority = wb.SheetNames.filter((n) =>
    LIGA_KEYWORDS.some((k) => n.toLowerCase().includes(k))
  );
  const rest = wb.SheetNames.filter((n) => !priority.includes(n));
  const ordered = [...priority, ...rest];

  for (const sheetName of ordered) {
    const ws = wb.Sheets[sheetName];
    // raw: false → datas como strings formatadas
    const rawRows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];

    const liga = extractLigaSection(rawRows, sheetName);
    if (liga) {
      console.log(
        `[import-calendar] Liga section found in sheet "${sheetName}": ${liga.rows.length} games`
      );
      return { liga, allSheetsText: liga.csvTable, warnings: [...warnings, ...liga.warnings] };
    }

    // Keep CSV for fallback
    const csvText = XLSX.utils.sheet_to_csv(ws);
    sheetTexts.push(`--- FOLHA: ${sheetName} ---\n${csvText}`);
  }

  warnings.push(
    "Não foi encontrada secção Liga automaticamente — a processar todas as folhas"
  );
  return { liga: null, allSheetsText: sheetTexts.join("\n\n"), warnings };
}

// ─── PDF helper ───────────────────────────────────────────
async function extractPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>;
  const { text } = await pdfParse(buffer);
  return text;
}

// ─── Regex fallback para rows pré-processados ─────────────
function regexParseFromLiga(
  liga: LigaSection,
  ourTeam: string
): AIParseResult {
  const ourPattern = new RegExp(
    ourTeam.normalize("NFD").replace(/[̀-ͯ]/g, ""),
    "i"
  );

  const games: RawGame[] = [];
  const errors: string[] = [];
  const allTeams = new Set<string>();
  let idx = 0;

  for (const r of liga.rows) {
    idx++;
    const homeTeam = normalizeTeamName(r.home_team);
    const awayTeam = normalizeTeamName(r.away_team);
    const date = parseDate(r.date_raw);
    const time = parseTime(r.time_raw);

    if (!homeTeam || !awayTeam) {
      errors.push(`Linha ${idx}: equipa em falta — "${r.home_team}" vs "${r.away_team}"`);
      continue;
    }
    if (!date) {
      errors.push(`Linha ${idx}: data inválida — "${r.date_raw}" (${homeTeam} vs ${awayTeam})`);
      continue;
    }

    const isHome = ourPattern.test(homeTeam);
    const isOurGame = isHome || ourPattern.test(awayTeam);

    games.push({
      jornada:   r.jornada,
      jogo_num:  r.jogo_num ?? idx,
      home_team: homeTeam,
      away_team: awayTeam,
      date_raw:  r.date_raw,
      date,
      time,
      pavilion:  r.pavilion,
      locality:  r.locality,
      is_our_game: isOurGame,
      is_home: isHome,
    });

    allTeams.add(homeTeam);
    allTeams.add(awayTeam);
  }

  const jornadasFound = games.length
    ? Math.max(...games.map((g) => g.jornada))
    : 0;

  return {
    games,
    all_teams: Array.from(allTeams).sort(),
    jornadas_found: jornadasFound,
    errors,
    corrections: [],
    _ai_teams: [],
    _ai_jornadas: [],
  };
}

// ─── Detecção de competição (Liga vs Taça) ────────────────

type Competition = "Liga" | "Taça";

async function detectCompetitions(
  events: Array<{ title: string; event_date: string; event_time?: string | null; location?: string | null; opponent?: string | null; jornada?: number }>,
  rawText: string,
  ligaSectionDetected: boolean,
  useAI: boolean,
  apiKey: string | undefined
): Promise<Map<string, Competition>> {
  const map = new Map<string, Competition>();

  // Liga section detected cleanly → all games are Liga, skip DeepSeek
  if (ligaSectionDetected) {
    for (const evt of events) {
      map.set(`${evt.event_date}|${evt.opponent ?? ""}`, "Liga");
    }
    return map;
  }

  // Local detection pass
  const needsAI: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const key = `${evt.event_date}|${evt.opponent ?? ""}`;
    const text = `${evt.title ?? ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

    if (/tac[ao]|eliminat[oa]ria|copa|knockout|k\.o\./i.test(text)) {
      map.set(key, "Taça");
    } else if (/liga|jornada\s*\d|campeonato/i.test(text)) {
      map.set(key, "Liga");
    } else {
      map.set(key, "Liga"); // safe default
      needsAI.push(i);
    }
  }

  // DeepSeek for ambiguous games (only when AI is enabled and there's ambiguity)
  if (!useAI || !apiKey || needsAI.length === 0) return map;

  const ambiguousGames = needsAI.slice(0, 30).map(i => {
    const evt = events[i];
    const match = evt.title?.match(/^(.+?)\s+vs\s+(.+?)(?:\s+\(|$)/i);
    return {
      game_index: i,
      home_team: match?.[1]?.trim() ?? "",
      away_team: match?.[2]?.trim() ?? evt.opponent ?? "",
      date: evt.event_date,
      round: `Jornada ${evt.jornada ?? "?"}`,
      raw_text: evt.title ?? "",
    };
  });

  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: "És um especialista em calendários de basquetebol português. Respondes sempre em JSON puro, sem markdown.",
          },
          {
            role: "user",
            content: `Analisa estes jogos e classifica cada um como "Liga" ou "Taça".

Pistas:
- "Jornada X" numerada, formato round-robin, calendário fixo → Liga
- "Eliminatória", "Taça", "Fase", formato knockout → Taça
- Sem pistas claras → Liga (padrão)

Devolve APENAS este JSON:
{
  "results": [
    { "game_index": <number>, "competition": "Liga" | "Taça", "reason": "<breve>" }
  ]
}

Contexto do ficheiro (primeiras linhas):
${rawText.slice(0, 300)}

Jogos a classificar:
${JSON.stringify({ operation: "competition_detection", games: ambiguousGames }, null, 2)}`,
          },
        ],
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      console.log(`[import-calendar] competition detection tokens: ${json.usage?.prompt_tokens}+${json.usage?.completion_tokens}`);
      const raw = (json.choices?.[0]?.message?.content ?? "") as string;
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned) as { results: Array<{ game_index: number; competition: string }> };
      for (const r of result.results ?? []) {
        const idx = r.game_index;
        if (idx >= 0 && idx < events.length) {
          const evt = events[idx];
          map.set(`${evt.event_date}|${evt.opponent ?? ""}`, r.competition === "Taça" ? "Taça" : "Liga");
        }
      }
    }
  } catch (e) {
    console.warn("[import-calendar] competition detection failed (non-fatal):", (e as Error).message);
  }

  return map;
}

// ─── POST /api/import-calendar ────────────────────────────
export async function POST(req: NextRequest) {
  console.log("[import-calendar] POST received");

  const { user, supabase } = await getUser();
  if (!user) return fail("Não autenticado. Por favor faz login.", null, 401);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    return fail("Não foi possível ler o formulário", e, 400);
  }

  const file       = formData.get("file") as File | null;
  const seasonId   = formData.get("season_id") as string | null;
  const ourTeam    = (formData.get("our_team") as string) || "CD Póvoa Masters";
  const dryRun     = formData.get("dry_run") === "true";
  const importAll  = formData.get("import_all") === "true";
  const useAI      = formData.get("use_ai") === "true";
  const reportOnly = formData.get("report_only") === "true";

  if (!file) return fail("Nenhum ficheiro recebido.");
  if (!seasonId && !reportOnly) return fail("Seleciona uma temporada antes de importar.");

  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const allowed = ["pdf", "xlsx", "xls", "ods", "csv"];
  if (!allowed.includes(ext)) return fail(`Formato .${ext} não suportado.`);

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return fail("O ficheiro está vazio.");
  } catch (e) {
    return fail("Erro ao ler o ficheiro", e, 500);
  }

  console.log("[import-calendar]", { file: filename, ext, size: buffer.length, useAI });

  // ── Extração por tipo de ficheiro ──────────────────────
  const warnings: string[] = [];
  let rawText = "";
  let ligaSection: LigaSection | null = null;

  if (ext === "pdf") {
    try {
      rawText = await extractPDF(buffer);
      if (!rawText.trim()) return fail("PDF sem texto legível (protegido ou em modo imagem).");
    } catch (e) {
      return fail(`Erro ao ler PDF: ${(e as Error).message}`, e, 500);
    }
  } else if (["xlsx", "xls", "ods"].includes(ext)) {
    try {
      const result = await extractExcelLiga(buffer);
      ligaSection = result.liga;
      rawText = result.allSheetsText;
      warnings.push(...result.warnings);

      if (ligaSection) {
        console.log(
          `[import-calendar] Liga pré-processada: ${ligaSection.rows.length} linhas de jogo`
        );
        if (!rawText.trim()) rawText = ligaSection.csvTable;
      } else {
        console.warn("[import-calendar] Secção Liga não detectada automaticamente");
      }
    } catch (e) {
      return fail(`Erro ao ler Excel: ${(e as Error).message}`, e, 500);
    }
  } else if (ext === "csv") {
    try {
      rawText = buffer.toString("utf-8");
    } catch (e) {
      return fail(`Erro ao ler CSV: ${(e as Error).message}`, e, 500);
    }
  }

  if (!rawText.trim()) return fail("O ficheiro não contém conteúdo legível.");

  // ── Parse ─────────────────────────────────────────────
  let parseResult: AIParseResult;
  let usedAI = false;
  let aiAttempted = false;

  try {
    if (useAI) {
      if (!process.env.DEEPSEEK_API_KEY) {
        warnings.push("DEEPSEEK_API_KEY não configurada — a usar parser de regex");
        parseResult = ligaSection
          ? regexParseFromLiga(ligaSection, ourTeam)
          : fallbackRegex(ext, rawText, ourTeam);
      } else {
        aiAttempted = true;
        console.log("[import-calendar] A processar com IA...");
        if (ligaSection) {
          parseResult = await parseExcelWithAI(ligaSection.csvTable, ourTeam);
        } else {
          parseResult = await parseCalendarWithAI(rawText, ourTeam);
        }
        usedAI = true;
        console.log(`[import-calendar] IA concluída: ${parseResult.games.length} jogos`);
      }
    } else {
      parseResult = ligaSection
        ? regexParseFromLiga(ligaSection, ourTeam)
        : fallbackRegex(ext, rawText, ourTeam);
    }
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[import-calendar] Erro no parse:", msg);
    warnings.push(`Erro no parser (${aiAttempted ? "IA" : "regex"}): ${msg}`);
    // Fallback para regex sempre que a IA falha
    try {
      parseResult = ligaSection
        ? regexParseFromLiga(ligaSection, ourTeam)
        : fallbackRegex(ext, rawText, ourTeam);
      if (aiAttempted) {
        warnings.push(
          `IA falhou — a usar parser de regex (${parseResult.games.length} jogos encontrados)`
        );
      }
    } catch (e2) {
      return fail(
        `Não foi possível processar o ficheiro: ${(e2 as Error).message}`,
        e2,
        500
      );
    }
  }

  // ── Report only ───────────────────────────────────────
  if (reportOnly) {
    const report = buildReport(parseResult);
    const sql = seasonId ? generateSQL(report, seasonId, ourTeam) : null;
    return ok({
      used_ai: usedAI,
      report,
      sql,
      corrections: parseResult.corrections ?? [],
      warnings: [...warnings, ...parseResult.errors],
      raw_text_preview: rawText.slice(0, 800),
      liga_rows_found: ligaSection?.rows.length ?? null,
    });
  }

  // ── Validação ─────────────────────────────────────────
  const validation = validateParseResult(parseResult);

  if (!validation.valid && parseResult.games.length === 0) {
    return NextResponse.json({
      success: false,
      error: "Nenhum jogo encontrado no ficheiro.",
      errors: [...validation.errors, ...parseResult.errors],
      warnings: [...warnings, ...validation.warnings],
      games_found: 0,
      jornadas_found: 0,
      teams_found: 0,
      corrections: parseResult.corrections ?? [],
      raw_text_preview: rawText.slice(0, 800),
      liga_rows_found: ligaSection?.rows.length ?? null,
    });
  }

  const payload = buildImportPayload(parseResult, seasonId!, ourTeam, !importAll);

  // ── Detecção de competição (Liga vs Taça) ─────────────────────────
  const competitionMap = await detectCompetitions(
    payload.events_to_create,
    rawText,
    ligaSection !== null,
    useAI,
    process.env.DEEPSEEK_API_KEY
  );

  // ── Pré-carregar jogos existentes (1 query, deduplicação batch) ─
  const { data: existingRaw } = await supabase
    .from("events")
    .select("event_date, opponent")
    .eq("season_id", seasonId!)
    .eq("type", "jogo");

  const existingSet = new Set(
    (existingRaw ?? []).map(
      (e: { event_date: string; opponent: string | null }) =>
        `${e.event_date}|${e.opponent ?? ""}`
    )
  );

  // ── Dry run ───────────────────────────────────────────
  if (dryRun) {
    type DryEntry = { date: string; time: string; title: string; location: string; jornada: number; competition: string };
    const previewNew: DryEntry[] = [];
    const previewIgnored: DryEntry[] = [];

    for (const e of payload.events_to_create) {
      if (!e.event_date) continue;
      const key = `${e.event_date}|${e.opponent ?? ""}`;
      const item: DryEntry = {
        date: e.event_date,
        time: e.event_time ?? "",
        title: e.title,
        location: e.location ?? "",
        jornada: e.jornada ?? 0,
        competition: competitionMap.get(key) ?? "Liga",
      };
      if (existingSet.has(key)) {
        previewIgnored.push(item);
      } else {
        previewNew.push(item);
      }
    }

    return ok({
      dry_run: true,
      used_ai: usedAI,
      jornadas_found: parseResult.jornadas_found,
      teams_found: parseResult.all_teams.length,
      games_found: parseResult.games.length,
      our_games: payload.summary.our_games,
      games_new: previewNew.length,
      games_ignored: previewIgnored.length,
      parse_errors: parseResult.errors,
      warnings: [...warnings, ...validation.warnings],
      corrections: parseResult.corrections ?? [],
      liga_rows_found: ligaSection?.rows.length ?? null,
      preview_games: previewNew,
      preview_ignored: previewIgnored,
      preview_teams: payload.teams_to_create.map((t) => t.name),
    });
  }

  // ── Inserir equipas ───────────────────────────────────
  let teamsCreated = 0;
  const teamErrors: string[] = [];
  const aiTeams = (parseResult._ai_teams ?? []) as AITeam[];

  for (const team of payload.teams_to_create) {
    const aiTeam = aiTeams.find((t) => t.normalized_name === team.normalized_name);
    const { error } = await supabase.from("league_teams").upsert(
      {
        name:             team.name,
        normalized_name:  team.normalized_name,
        home_pavilion:    aiTeam?.home_pavilion ?? team.home_pavilion ?? null,
        locality:         aiTeam?.locality      ?? team.locality      ?? null,
        ccd_number:       aiTeam?.ccd_number    ?? null,
        is_our_team:      team.normalized_name === slugTeamName(ourTeam),
      },
      { onConflict: "normalized_name", ignoreDuplicates: false }
    );
    if (error) teamErrors.push(`"${team.name}": ${error.message}`);
    else teamsCreated++;
  }

  // ── Inserir eventos ───────────────────────────────────
  type GameEntry = { date: string; time: string; title: string; location: string; jornada: number };
  let gamesCreated = 0;
  let gamesIgnored = 0;
  let gamesSkipped = 0;
  const gameErrors: string[] = [];
  const createdList: GameEntry[] = [];
  const ignoredList: GameEntry[] = [];

  for (const evt of payload.events_to_create) {
    if (!evt.event_date) { gamesSkipped++; continue; }

    const key = `${evt.event_date}|${evt.opponent ?? ""}`;
    const entry: GameEntry = {
      date: evt.event_date,
      time: evt.event_time ?? "",
      title: evt.title,
      location: evt.location ?? "",
      jornada: evt.jornada ?? 0,
    };

    if (existingSet.has(key)) {
      gamesIgnored++;
      ignoredList.push(entry);
    } else {
      const { error } = await supabase.from("events").insert({
        season_id: evt.season_id, type: "jogo",
        title: evt.title, location: evt.location,
        event_date: evt.event_date, event_time: evt.event_time,
        opponent: evt.opponent, description: evt.description,
        competition: competitionMap.get(key) ?? "Liga",
        created_by: user.id,
      });
      if (error) {
        gameErrors.push(`${evt.event_date} vs ${evt.opponent}: ${error.message}`);
      } else {
        gamesCreated++;
        createdList.push(entry);
        existingSet.add(key); // previne duplicados dentro do mesmo ficheiro
      }
    }
  }

  // ── Log (não-fatal) ───────────────────────────────────
  const allErrors = [...(parseResult.errors ?? []), ...teamErrors, ...gameErrors];
  try {
    await supabase.from("calendar_imports").insert({
      season_id: seasonId, filename,
      file_type: ext as "pdf" | "excel" | "csv",
      our_team_name: ourTeam,
      jornadas_found: parseResult.jornadas_found,
      teams_found: parseResult.all_teams.length,
      teams_created: teamsCreated,
      games_found: parseResult.games.length,
      games_created: gamesCreated,
      games_skipped: gamesSkipped,
      games_ignored: gamesIgnored,
      errors: allErrors,
      raw_games: parseResult.games as unknown as RawGame[],
      imported_by: user.id,
    });
  } catch { /* tabela pode não existir ainda */ }

  return ok({
    used_ai: usedAI,
    jornadas_found: parseResult.jornadas_found,
    teams_found: parseResult.all_teams.length,
    teams_created: teamsCreated,
    games_found: parseResult.games.length,
    games_created: gamesCreated,
    games_ignored: gamesIgnored,
    games_skipped: gamesSkipped,
    corrections: parseResult.corrections ?? [],
    errors: allErrors,
    warnings: [...warnings, ...validation.warnings],
    teams_created_list: payload.teams_to_create.map((t) => t.name),
    created_list: createdList,
    ignored_list: ignoredList,
  });
}

// ─── GET — histórico ──────────────────────────────────────
export async function GET() {
  const { user, supabase } = await getUser();
  if (!user) return fail("Não autenticado", null, 401);

  const { data, error } = await supabase
    .from("calendar_imports")
    .select("id, filename, file_type, games_created, games_ignored, teams_created, errors, created_at, season_id")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("[import-calendar] GET error:", error.message);
    return NextResponse.json({ imports: [] });
  }
  return NextResponse.json({ imports: data ?? [] });
}

// ─── Regex fallback para quando não há secção Liga detetada
function fallbackRegex(ext: string, rawText: string, ourTeam: string): AIParseResult {
  const r = parsePDFText(rawText, ourTeam);
  return { ...r, corrections: [], _ai_teams: [], _ai_jornadas: [] };
}
