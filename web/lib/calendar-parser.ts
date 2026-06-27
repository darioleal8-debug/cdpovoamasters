/**
 * Parser do Calendário INATEL Porto
 *
 * Suporta:
 *  - PDF  (extração de texto + deteção de tabelas)
 *  - Excel / XLSX (leitura de colunas)
 *  - CSV  (fallback com separador ; ou ,)
 *
 * Formato INATEL esperado:
 *  Colunas: JOGO Nº | VISITADO | VISITANTE | DATA | HORA | PAVILHÃO | LOCAL
 *  Jornadas: linhas "JORNADA N" ou "Nª JORNADA"
 */

// ─── Types ────────────────────────────────────────────────

export interface RawGame {
  jornada: number;
  jogo_num: number;
  home_team: string;
  away_team: string;
  date_raw: string;
  date: string | null;   // ISO YYYY-MM-DD
  time: string | null;   // HH:MM
  pavilion: string;
  locality: string;
  is_our_game: boolean;  // involves our team
  is_home: boolean;      // our team is home (visitado)
}

export interface ParseResult {
  games: RawGame[];
  all_teams: string[];
  jornadas_found: number;
  errors: string[];
}

export interface ImportPayload {
  events_to_create: EventInsert[];
  teams_to_create: TeamInsert[];
  summary: {
    total_games: number;
    our_games: number;
    teams_total: number;
  };
}

export interface EventInsert {
  season_id: string;
  type: "jogo";
  title: string;
  location: string;
  event_date: string;
  event_time: string;
  opponent: string;
  description: string;
  jornada?: number;
  jogo_num?: number;
}

export interface TeamInsert {
  name: string;
  normalized_name: string;
  home_pavilion?: string;
  locality?: string;
}

// ─── Constants ────────────────────────────────────────────

const PT_MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// Common OCR corrections in INATEL PDFs
const OCR_FIXES: [RegExp, string][] = [
  [/\bP\s+av\./gi,         "Pav."],
  [/\bP\.av\./gi,          "Pav."],
  [/\bGim\s*n[áa]sio\b/gi, "Ginásio"],
  [/\bPov\./gi,            "Póvoa"],
  [/\bM\. de V\./gi,       "Matosinhos"],
  [/\b0\b(?=\d)/g,         "O"],      // zero vs letter O
];

// INATEL column header synonyms
const COL_HEADERS: Record<string, string[]> = {
  jogo_num:   ["jogo", "jogo nº", "jogo n.", "nº", "n."],
  home_team:  ["visitado", "casa"],
  away_team:  ["visitante", "fora", "adversário"],
  date:       ["data"],
  time:       ["hora"],
  pavilion:   ["pavilhão", "pavilhao", "pavilião", "recinto"],
  locality:   ["local", "localidade", "cidade"],
};

// ─── Text Normalization ───────────────────────────────────

export function normalizeTeamName(raw: string): string {
  let s = raw.trim();

  // Apply OCR fixes
  for (const [pattern, replacement] of OCR_FIXES) {
    s = s.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, " ").trim();

  // Fix common abbreviation formats
  s = s
    .replace(/\bC\.D\./gi, "CD")
    .replace(/\bC\.A\./gi, "CA")
    .replace(/\bG\.D\./gi, "GD")
    .replace(/\bS\.C\./gi, "SC")
    .replace(/\bA\.D\./gi, "AD")
    .replace(/\bA\.B\./gi, "AB")
    .replace(/\bB\.C\.\s*/gi, "BC ");

  return s.replace(/\s{2,}/g, " ").trim();
}

export function slugTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─── Date / Time Parsing ──────────────────────────────────

const DATE_RE = /(\d{1,2})[\/\-\.](\d{1,2}|\w{3})[\/\-\.](\d{4})/i;

export function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Remove day-name prefix: "qui, " / "sex " / etc.
  let s = raw.replace(/^\w+[,.]?\s*/, "").trim();

  const m = s.match(DATE_RE);
  if (!m) return null;

  let [, d, mid, y] = m;
  let month: number;

  if (/^\d+$/.test(mid)) {
    month = parseInt(mid, 10);
  } else {
    const key = mid.toLowerCase().slice(0, 3);
    month = PT_MONTHS[key] ?? 0;
  }

  const day = parseInt(d, 10);
  const year = parseInt(y, 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 2020 || year > 2040) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseTime(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[:\.](\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ─── Jornada Detection ────────────────────────────────────

const JORNADA_RE =
  /(?:JORNADA|Jornada|ROUND|RONDA)\s+(\d+)|(\d+)[ªºa-z]*\s+JORNADA/i;

export function detectJornada(line: string): number | null {
  const m = line.match(JORNADA_RE);
  if (!m) return null;
  return parseInt(m[1] ?? m[2], 10);
}

// ─── Game Line Parser ─────────────────────────────────────

/**
 * Attempt to parse a single text line as a game row.
 * Returns null if the line doesn't look like a game.
 */
export function parseGameLine(
  line: string,
  jornada: number,
  ourTeamPattern: RegExp
): RawGame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Must start with a number (game number)
  const numMatch = trimmed.match(/^(\d+)\s+/);
  if (!numMatch) return null;
  const jogoNum = parseInt(numMatch[1], 10);
  if (jogoNum > 200) return null; // sanity check

  const afterNum = trimmed.slice(numMatch[0].length);

  // Find the date anchor
  const dateMatch = afterNum.match(
    /(\w{2,4}[,.]?\s*)?\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/
  );
  if (!dateMatch) return null;

  const dateIdx = afterNum.indexOf(dateMatch[0]);
  const teamsRaw = afterNum.slice(0, dateIdx).trim();
  const afterDate = afterNum.slice(dateIdx + dateMatch[0].length).trim();

  // Split teams by 2+ spaces
  const teamParts = teamsRaw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);

  let homeTeam: string;
  let awayTeam: string;

  if (teamParts.length >= 2) {
    homeTeam = normalizeTeamName(teamParts[0]);
    awayTeam = normalizeTeamName(teamParts.slice(1).join(" "));
  } else if (teamParts.length === 1) {
    // Single token — try to split at "vs" or "x"
    const vsSplit = teamParts[0].split(/\s+(?:vs?\.?|x)\s+/i);
    if (vsSplit.length === 2) {
      homeTeam = normalizeTeamName(vsSplit[0]);
      awayTeam = normalizeTeamName(vsSplit[1]);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!homeTeam || !awayTeam) return null;

  // Parse time
  const timeMatch = afterDate.match(/(\d{1,2})[:\.](\d{2})/);
  if (!timeMatch) return null;
  const timeStr = parseTime(timeMatch[0]) ?? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;

  const afterTime = afterDate.slice(
    afterDate.indexOf(timeMatch[0]) + timeMatch[0].length
  ).trim();

  // Pavilion and locality — split by 2+ spaces OR just take everything
  const venueParts = afterTime.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const pavilion = normalizeTeamName(venueParts[0] ?? "");
  const locality = venueParts.slice(1).join(", ") || "";

  const isHome = ourTeamPattern.test(homeTeam);
  const isAway = ourTeamPattern.test(awayTeam);
  const isOurGame = isHome || isAway;

  return {
    jornada,
    jogo_num: jogoNum,
    home_team: homeTeam,
    away_team: awayTeam,
    date_raw: dateMatch[0],
    date: parseDate(dateMatch[0]),
    time: timeStr,
    pavilion,
    locality,
    is_our_game: isOurGame,
    is_home: isHome,
  };
}

// ─── PDF Text Parser ──────────────────────────────────────

export function parsePDFText(
  text: string,
  ourTeam: string = "Póvoa"
): ParseResult {
  const ourTeamPattern = new RegExp(
    ourTeam.normalize("NFD").replace(/[̀-ͯ]/g, ""),
    "i"
  );

  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, "   "));
  const games: RawGame[] = [];
  const errors: string[] = [];
  const allTeamsSet = new Set<string>();

  let currentJornada = 0;
  let lineNum = 0;

  for (const rawLine of lines) {
    lineNum++;
    const line = rawLine.trim();
    if (!line) continue;

    // Detect jornada header
    const j = detectJornada(line);
    if (j !== null) {
      currentJornada = j;
      continue;
    }

    // Skip obvious non-game lines
    if (
      /^(JOGO|Jogo|VISITADO|VISITANTE|DATA|HORA|PAVILHÃO|LOCAL|LIGA|ÉPOCA|CALENDÁRIO)/i.test(line)
    ) continue;

    // Attempt game parse
    if (currentJornada > 0) {
      const game = parseGameLine(line, currentJornada, ourTeamPattern);
      if (game) {
        games.push(game);
        allTeamsSet.add(game.home_team);
        allTeamsSet.add(game.away_team);
      } else if (/^\d+\s/.test(line)) {
        // Looks like a game row but failed to parse
        errors.push(`Linha ${lineNum}: não foi possível extrair jogo — "${line.slice(0, 80)}"`);
      }
    }
  }

  const jornadasFound = games.length > 0
    ? Math.max(...games.map((g) => g.jornada))
    : 0;

  return {
    games,
    all_teams: Array.from(allTeamsSet).sort(),
    jornadas_found: jornadasFound,
    errors,
  };
}

// ─── Excel Row Parser ─────────────────────────────────────

interface ExcelRow {
  [key: string]: string | number | undefined;
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();
}

function findColIndex(headers: string[], colKey: string): number {
  const synonyms = COL_HEADERS[colKey] ?? [colKey];
  for (let i = 0; i < headers.length; i++) {
    if (synonyms.some((s) => headers[i].includes(s))) return i;
  }
  return -1;
}

export function parseExcelRows(
  rows: ExcelRow[],
  ourTeam: string = "Póvoa"
): ParseResult {
  const ourTeamPattern = new RegExp(
    ourTeam.normalize("NFD").replace(/[̀-ͯ]/g, ""),
    "i"
  );

  if (rows.length === 0) {
    return { games: [], all_teams: [], jornadas_found: 0, errors: ["Ficheiro vazio"] };
  }

  // Find header row (first row that contains known column names)
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const headers = Object.values(rows[i]).map(normalizeHeader);
    const homeIdx = findColIndex(headers, "home_team");
    const awayIdx = findColIndex(headers, "away_team");
    if (homeIdx >= 0 && awayIdx >= 0) {
      headerRowIdx = i;
      const keys = Object.keys(rows[i]);
      colMap = {
        jogo_num:  findColIndex(headers, "jogo_num"),
        home_team: homeIdx,
        away_team: awayIdx,
        date:      findColIndex(headers, "date"),
        time:      findColIndex(headers, "time"),
        pavilion:  findColIndex(headers, "pavilion"),
        locality:  findColIndex(headers, "locality"),
      };
      // Remap to keys
      for (const [k, v] of Object.entries(colMap)) {
        colMap[k] = v >= 0 ? parseInt(keys[v] ?? "-1") : -1;
      }
      break;
    }
  }

  const games: RawGame[] = [];
  const errors: string[] = [];
  const allTeamsSet = new Set<string>();
  let currentJornada = 0;

  const dataRows = headerRowIdx >= 0 ? rows.slice(headerRowIdx + 1) : rows;
  const colKeys = Object.keys(dataRows[0] ?? {});

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const values = colKeys.map((k) => String(row[k] ?? "").trim());
    const rowStr = values.join(" ");

    // Check for jornada marker
    const j = detectJornada(rowStr);
    if (j !== null) { currentJornada = j; continue; }

    // Get column values
    const get = (k: string): string => {
      const idx = colMap[k] ?? -1;
      return idx >= 0 ? values[idx] ?? "" : "";
    };

    const homeRaw = get("home_team") || values[1] || "";
    const awayRaw = get("away_team") || values[2] || "";
    const dateRaw = get("date")      || values[3] || "";
    const timeRaw = get("time")      || values[4] || "";
    const pavilion = normalizeTeamName(get("pavilion") || values[5] || "");
    const locality  = (get("locality") || values[6] || "").trim();
    const jogoNumRaw = get("jogo_num") || values[0] || "";
    const jogoNum = parseInt(jogoNumRaw, 10);

    if (!homeRaw || !awayRaw) continue;
    if (!dateRaw && !timeRaw) continue;

    const homeTeam = normalizeTeamName(homeRaw);
    const awayTeam = normalizeTeamName(awayRaw);
    const date = parseDate(dateRaw);
    const time = parseTime(timeRaw);

    if (!date) {
      errors.push(`Linha ${headerRowIdx + i + 2}: data inválida — "${dateRaw}"`);
      continue;
    }

    const isHome = ourTeamPattern.test(homeTeam);
    const isOurGame = isHome || ourTeamPattern.test(awayTeam);

    const game: RawGame = {
      jornada: isNaN(currentJornada) ? 0 : currentJornada,
      jogo_num: isNaN(jogoNum) ? i + 1 : jogoNum,
      home_team: homeTeam,
      away_team: awayTeam,
      date_raw: dateRaw,
      date,
      time,
      pavilion,
      locality,
      is_our_game: isOurGame,
      is_home: isHome,
    };

    games.push(game);
    allTeamsSet.add(homeTeam);
    allTeamsSet.add(awayTeam);
  }

  const jornadasFound = games.length > 0
    ? Math.max(...games.map((g) => g.jornada))
    : 0;

  return {
    games,
    all_teams: Array.from(allTeamsSet).sort(),
    jornadas_found: jornadasFound,
    errors,
  };
}

// ─── Validation ───────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateParseResult(result: ParseResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (result.games.length === 0) {
    errors.push("Nenhum jogo encontrado no ficheiro.");
    return { valid: false, errors, warnings };
  }

  const seen = new Set<string>();

  for (const g of result.games) {
    // Date check
    if (!g.date) {
      errors.push(`Jornada ${g.jornada} Jogo ${g.jogo_num}: data inválida "${g.date_raw}"`);
    }

    // Time check
    if (!g.time) {
      warnings.push(`Jornada ${g.jornada} Jogo ${g.jogo_num}: hora em falta`);
    }

    // Team names
    if (g.home_team.length < 2) {
      errors.push(`Jornada ${g.jornada} Jogo ${g.jogo_num}: equipa da casa inválida`);
    }
    if (g.away_team.length < 2) {
      errors.push(`Jornada ${g.jornada} Jogo ${g.jogo_num}: equipa visitante inválida`);
    }

    // Duplicates
    const key = `${g.date}|${g.home_team}|${g.away_team}`;
    if (seen.has(key)) {
      warnings.push(`Jogo duplicado: ${g.home_team} vs ${g.away_team} em ${g.date}`);
    }
    seen.add(key);
  }

  // Jornada sequence check
  const jornadas = [...new Set(result.games.map((g) => g.jornada))].sort((a, b) => a - b);
  for (let i = 1; i < jornadas.length; i++) {
    if (jornadas[i] - jornadas[i - 1] > 1) {
      warnings.push(`Jornadas não contíguas: ${jornadas[i - 1]} → ${jornadas[i]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Build Import Payload ─────────────────────────────────

export function buildImportPayload(
  result: ParseResult,
  seasonId: string,
  ourTeamName: string,
  filterOurGamesOnly: boolean = true
): ImportPayload {
  const filteredGames = filterOurGamesOnly
    ? result.games.filter((g) => g.is_our_game)
    : result.games;

  const teamsToCreate: TeamInsert[] = [];
  const seenTeams = new Set<string>();

  for (const team of result.all_teams) {
    const slug = slugTeamName(team);
    if (!seenTeams.has(slug)) {
      seenTeams.add(slug);
      // Find a game with pavilion/locality for this team
      const asHome = result.games.find((g) => slugTeamName(g.home_team) === slug);
      teamsToCreate.push({
        name: team,
        normalized_name: slug,
        home_pavilion: asHome?.pavilion || undefined,
        locality: asHome?.locality || undefined,
      });
    }
  }

  const eventsToCreate: EventInsert[] = filteredGames
    .filter((g) => g.date !== null)
    .map((g) => {
      const opponent = g.is_home ? g.away_team : g.home_team;
      const homeAway = g.is_home ? "Casa" : "Fora";
      const jornStr = g.jornada > 0 ? `J${g.jornada} • ` : "";
      const location = [g.pavilion, g.locality].filter(Boolean).join(" — ");

      return {
        season_id: seasonId,
        type: "jogo" as const,
        title: `${jornStr}${ourTeamName} vs ${opponent} (${homeAway})`,
        location: location || "—",
        event_date: g.date!,
        event_time: g.time ?? "00:00",
        opponent,
        description: JSON.stringify({
          jornada: g.jornada,
          jogo_num: g.jogo_num,
          home_team: g.home_team,
          away_team: g.away_team,
          pavilion: g.pavilion,
          locality: g.locality,
          is_home: g.is_home,
        }),
        jornada: g.jornada,
        jogo_num: g.jogo_num,
      };
    });

  return {
    events_to_create: eventsToCreate,
    teams_to_create: teamsToCreate,
    summary: {
      total_games: result.games.length,
      our_games: filteredGames.length,
      teams_total: result.all_teams.length,
    },
  };
}
