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

export const runtime = "nodejs";
export const maxDuration = 60;

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

// ─── POST /api/import-calendar ────────────────────────────
// Recebe: multipart/form-data com:
//   file      — PDF, xlsx, xls ou csv
//   season_id — UUID da temporada ativa
//   our_team  — nome da nossa equipa (default: CD Póvoa Masters)
//   dry_run   — "true" para apenas pré-visualizar (não insere)
export async function POST(req: NextRequest) {
  const { user, supabase } = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido" }, { status: 400 });
  }

  const file     = formData.get("file") as File | null;
  const seasonId = formData.get("season_id") as string | null;
  const ourTeam  = (formData.get("our_team") as string) || "CD Póvoa Masters";
  const dryRun   = formData.get("dry_run") === "true";
  const importAllGames = formData.get("import_all") === "true";

  if (!file) return NextResponse.json({ error: "Ficheiro obrigatório" }, { status: 400 });
  if (!seasonId) return NextResponse.json({ error: "Temporada obrigatória" }, { status: 400 });

  const filename  = file.name;
  const ext       = filename.split(".").pop()?.toLowerCase() ?? "";
  const buffer    = Buffer.from(await file.arrayBuffer());

  // ── Parse ─────────────────────────────────────────────
  let parseResult: ParseResult;

  try {
    if (ext === "pdf") {
      // pdf-parse is a CJS module; require() avoids ESM .default issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const pdfData  = await pdfParse(buffer);
      parseResult = parsePDFText(pdfData.text, ourTeam);

    } else if (["xlsx", "xls", "ods"].includes(ext)) {
      const XLSX = await import("xlsx");
      const wb   = XLSX.read(buffer, { type: "buffer", cellDates: true });

      // Merge all sheets (different sheets may be different jornadas)
      const allRows: Record<string, unknown>[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws   = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];

        // Check if sheet name is a jornada (e.g. "Jornada 1", "J1")
        const jornMatch = sheetName.match(/(\d+)/);
        const sheetJornada = jornMatch ? parseInt(jornMatch[1]) : 0;

        // Add jornada column if detected from sheet name
        for (const row of rows) {
          if (sheetJornada > 0 && !("jornada" in row)) {
            (row as Record<string, unknown>).jornada = sheetJornada;
          }
        }
        allRows.push(...rows);
      }

      parseResult = parseExcelRows(
        allRows as Record<string, string>[],
        ourTeam
      );

    } else if (ext === "csv") {
      // CSV: convert to array of objects manually
      const text    = buffer.toString("utf-8");
      const sep     = text.includes(";") ? ";" : ",";
      const lines   = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
      const rows: Record<string, string>[] = lines.slice(1).map((line) => {
        const cells = line.split(sep);
        return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
      });
      parseResult = parseExcelRows(rows, ourTeam);

    } else {
      return NextResponse.json(
        { error: `Formato não suportado: .${ext}. Use PDF, XLSX, XLS ou CSV.` },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Erro ao ler ficheiro: ${(e as Error).message}` },
      { status: 500 }
    );
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
      preview: [],
    });
  }

  // ── Dry run: return preview only ──────────────────────
  const payload = buildImportPayload(parseResult, seasonId, ourTeam, !importAllGames);

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      parse_errors: parseResult.errors,
      warnings: validation.warnings,
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

  // ── Import teams ──────────────────────────────────────
  let teamsCreated = 0;
  const teamErrors: string[] = [];

  for (const team of payload.teams_to_create) {
    const { error } = await supabase.from("league_teams").upsert(
      {
        name: team.name,
        normalized_name: team.normalized_name,
        home_pavilion: team.home_pavilion ?? null,
        locality: team.locality ?? null,
        is_our_team: team.normalized_name === slugTeamName(ourTeam),
      },
      { onConflict: "normalized_name", ignoreDuplicates: true }
    );
    if (error) {
      teamErrors.push(`Equipa "${team.name}": ${error.message}`);
    } else {
      teamsCreated++;
    }
  }

  // ── Import events ─────────────────────────────────────
  let gamesCreated = 0;
  let gamesSkipped = 0;
  let gamesUpdated = 0;
  const gameErrors: string[] = [];

  for (const evt of payload.events_to_create) {
    // Check for existing event (same date + opponent + season)
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("season_id", evt.season_id)
      .eq("type", "jogo")
      .eq("event_date", evt.event_date)
      .eq("opponent", evt.opponent)
      .maybeSingle();

    if (existing) {
      // Update if exists
      const { error } = await supabase
        .from("events")
        .update({
          title:      evt.title,
          location:   evt.location,
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
      // Insert new
      const { error } = await supabase.from("events").insert({
        season_id:   evt.season_id,
        type:        "jogo",
        title:       evt.title,
        location:    evt.location,
        event_date:  evt.event_date,
        event_time:  evt.event_time,
        opponent:    evt.opponent,
        description: evt.description,
        created_by:  user.id,
      });

      if (error) {
        gameErrors.push(`Jogo ${evt.event_date} vs ${evt.opponent}: ${error.message}`);
      } else {
        gamesCreated++;
      }
    }
  }

  // ── Log import ────────────────────────────────────────
  const allErrors = [...parseResult.errors, ...teamErrors, ...gameErrors];

  await supabase.from("calendar_imports").insert({
    season_id:       seasonId,
    filename,
    file_type:       ext as "pdf" | "excel" | "csv",
    our_team_name:   ourTeam,
    jornadas_found:  parseResult.jornadas_found,
    teams_found:     parseResult.all_teams.length,
    teams_created:   teamsCreated,
    games_found:     parseResult.games.length,
    games_created:   gamesCreated,
    games_skipped:   gamesSkipped,
    games_updated:   gamesUpdated,
    errors:          allErrors,
    raw_games:       parseResult.games as unknown as RawGame[],
    imported_by:     user.id,
  });

  return NextResponse.json({
    success: true,
    jornadas_found:  parseResult.jornadas_found,
    teams_found:     parseResult.all_teams.length,
    teams_created:   teamsCreated,
    games_found:     parseResult.games.length,
    games_created:   gamesCreated,
    games_updated:   gamesUpdated,
    games_skipped:   gamesSkipped,
    errors:          allErrors,
    warnings:        validation.warnings,
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
