import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  parsePDFText,
  parseExcelRows,
  validateParseResult,
  buildImportPayload,
  slugTeamName,
  type RawGame,
  type ParseResult,
} from "@/lib/calendar-parser";
import {
  parseCalendarWithAI,
  buildReport,
  generateSQL,
  type AITeam,
} from "@/lib/calendar-parser-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

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

// ─── Extract raw text from file ──────────────────────────
async function extractRawText(
  buffer: Buffer,
  ext: string
): Promise<{ text: string; rows?: Record<string, string>[] }> {
  if (ext === "pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return { text: data.text };
  }

  if (["xlsx", "xls", "ods"].includes(ext)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const allRows: Record<string, unknown>[] = [];
    let textLines: string[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      const csvText = XLSX.utils.sheet_to_csv(ws);
      textLines.push(`\n--- SHEET: ${sheetName} ---\n${csvText}`);

      const jornMatch = sheetName.match(/(\d+)/);
      const sheetJornada = jornMatch ? parseInt(jornMatch[1]) : 0;
      for (const row of rows) {
        if (sheetJornada > 0 && !("jornada" in row)) {
          (row as Record<string, unknown>).jornada = sheetJornada;
        }
      }
      allRows.push(...rows);
    }

    return {
      text: textLines.join("\n"),
      rows: allRows as Record<string, string>[],
    };
  }

  if (ext === "csv") {
    const text = buffer.toString("utf-8");
    const sep = text.includes(";") ? ";" : ",";
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(sep);
      return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
    });
    return { text, rows };
  }

  throw new Error(`Formato não suportado: .${ext}`);
}

// ─── POST /api/import-calendar ────────────────────────────
// Parâmetros multipart/form-data:
//   file       — PDF, xlsx, xls ou csv
//   season_id  — UUID da temporada ativa
//   our_team   — nome da nossa equipa (default: CD Póvoa Masters)
//   dry_run    — "true" para apenas pré-visualizar
//   import_all — "true" para importar todos os jogos (não só os nossos)
//   use_ai     — "true" para usar Claude API (interpretação semântica)
//   report_only — "true" para devolver JSON/SQL sem inserir
export async function POST(req: NextRequest) {
  const { user, supabase } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido" }, { status: 400 });
  }

  const file        = formData.get("file") as File | null;
  const seasonId    = formData.get("season_id") as string | null;
  const ourTeam     = (formData.get("our_team") as string) || "CD Póvoa Masters";
  const dryRun      = formData.get("dry_run") === "true";
  const importAll   = formData.get("import_all") === "true";
  const useAI       = formData.get("use_ai") === "true";
  const reportOnly  = formData.get("report_only") === "true";

  if (!file) return NextResponse.json({ error: "Ficheiro obrigatório" }, { status: 400 });
  if (!seasonId && !reportOnly) return NextResponse.json({ error: "Temporada obrigatória" }, { status: 400 });

  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Extract text / rows ───────────────────────────────
  let rawText = "";
  let rawRows: Record<string, string>[] | undefined;

  try {
    const extracted = await extractRawText(buffer, ext);
    rawText = extracted.text;
    rawRows = extracted.rows;
  } catch (e) {
    return NextResponse.json(
      { error: `Erro ao ler ficheiro: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  // ── Parse ────────────────────────────────────────────
  let parseResult: ParseResult & { corrections?: string[]; _ai_teams?: AITeam[] };

  try {
    if (useAI) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: "ANTHROPIC_API_KEY não configurada no servidor. Adiciona ao .env.local" },
          { status: 500 }
        );
      }
      parseResult = await parseCalendarWithAI(rawText, ourTeam);
    } else {
      if (ext === "pdf") {
        parseResult = parsePDFText(rawText, ourTeam);
      } else if (rawRows) {
        parseResult = parseExcelRows(rawRows, ourTeam);
      } else {
        parseResult = parsePDFText(rawText, ourTeam);
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Erro ao processar ficheiro: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  // ── Report only — devolver JSON + SQL sem inserir ─────
  if (reportOnly) {
    const report = buildReport(parseResult);
    const sql = seasonId ? generateSQL(report, seasonId, ourTeam) : null;
    return NextResponse.json({
      success: true,
      report,
      sql,
      corrections: parseResult.corrections ?? [],
    });
  }

  // ── Validate ──────────────────────────────────────────
  const validation = validateParseResult(parseResult);
  if (!validation.valid) {
    return NextResponse.json({
      success: false,
      parse_errors: parseResult.errors,
      validation_errors: validation.errors,
      warnings: validation.warnings,
      games_found: parseResult.games.length,
      corrections: parseResult.corrections ?? [],
    });
  }

  // ── Build payload ─────────────────────────────────────
  const payload = buildImportPayload(parseResult, seasonId!, ourTeam, !importAll);

  // ── Dry run ───────────────────────────────────────────
  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      used_ai: useAI,
      parse_errors: parseResult.errors,
      warnings: validation.warnings,
      corrections: parseResult.corrections ?? [],
      jornadas_found: parseResult.jornadas_found,
      teams_found: parseResult.all_teams.length,
      games_found: parseResult.games.length,
      our_games: payload.summary.our_games,
      preview_games: payload.events_to_create.map((e) => ({
        date: e.event_date,
        time: e.event_time,
        title: e.title,
        location: e.location,
        jornada: e.jornada,
      })),
      preview_teams: payload.teams_to_create.map((t) => t.name),
    });
  }

  // ── Insert teams ──────────────────────────────────────
  let teamsCreated = 0;
  const teamErrors: string[] = [];

  // Use enriched AI team data if available
  const aiTeams = parseResult._ai_teams ?? [];

  for (const team of payload.teams_to_create) {
    const aiTeam = aiTeams.find((t) => t.normalized_name === team.normalized_name);

    const { error } = await supabase.from("league_teams").upsert(
      {
        name: team.name,
        normalized_name: team.normalized_name,
        home_pavilion: aiTeam?.home_pavilion ?? team.home_pavilion ?? null,
        locality: aiTeam?.locality ?? team.locality ?? null,
        ccd_number: aiTeam?.ccd_number ?? null,
        is_our_team: team.normalized_name === slugTeamName(ourTeam),
      },
      { onConflict: "normalized_name", ignoreDuplicates: false }
    );

    if (error) {
      teamErrors.push(`Equipa "${team.name}": ${error.message}`);
    } else {
      teamsCreated++;
    }
  }

  // ── Insert events ─────────────────────────────────────
  let gamesCreated = 0;
  let gamesSkipped = 0;
  let gamesUpdated = 0;
  const gameErrors: string[] = [];

  for (const evt of payload.events_to_create) {
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("season_id", evt.season_id)
      .eq("type", "jogo")
      .eq("event_date", evt.event_date)
      .eq("opponent", evt.opponent)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("events")
        .update({
          title: evt.title,
          location: evt.location,
          event_time: evt.event_time,
          description: evt.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        gameErrors.push(`Jogo ${evt.event_date} vs ${evt.opponent}: ${error.message}`);
      } else {
        gamesUpdated++;
      }
    } else {
      const { error } = await supabase.from("events").insert({
        season_id: evt.season_id,
        type: "jogo",
        title: evt.title,
        location: evt.location,
        event_date: evt.event_date,
        event_time: evt.event_time,
        opponent: evt.opponent,
        description: evt.description,
        created_by: user.id,
      });

      if (error) {
        gameErrors.push(`Jogo ${evt.event_date} vs ${evt.opponent}: ${error.message}`);
      } else {
        gamesCreated++;
      }
    }
  }

  // ── Log import ────────────────────────────────────────
  const allErrors = [...(parseResult.errors ?? []), ...teamErrors, ...gameErrors];

  await supabase.from("calendar_imports").insert({
    season_id: seasonId,
    filename,
    file_type: ext as "pdf" | "excel" | "csv",
    our_team_name: ourTeam,
    jornadas_found: parseResult.jornadas_found,
    teams_found: parseResult.all_teams.length,
    teams_created: teamsCreated,
    games_found: parseResult.games.length,
    games_created: gamesCreated,
    games_skipped: gamesSkipped,
    games_updated: gamesUpdated,
    errors: allErrors,
    raw_games: parseResult.games as unknown as RawGame[],
    imported_by: user.id,
  });

  return NextResponse.json({
    success: true,
    used_ai: useAI,
    jornadas_found: parseResult.jornadas_found,
    teams_found: parseResult.all_teams.length,
    teams_created: teamsCreated,
    games_found: parseResult.games.length,
    games_created: gamesCreated,
    games_updated: gamesUpdated,
    games_skipped: gamesSkipped,
    corrections: parseResult.corrections ?? [],
    errors: allErrors,
    warnings: validation.warnings,
    teams_created_list: payload.teams_to_create.map((t) => t.name),
  });
}

// ─── GET /api/import-calendar — histórico ─────────────────
export async function GET() {
  const { user, supabase } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("calendar_imports")
    .select("id, filename, file_type, games_created, games_updated, teams_created, errors, created_at, season_id")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imports: data ?? [] });
}
