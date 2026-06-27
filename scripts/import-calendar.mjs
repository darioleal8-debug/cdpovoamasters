#!/usr/bin/env node
/**
 * Importador de Calendário INATEL — Script standalone
 *
 * Uso:
 *   node scripts/import-calendar.mjs --file calendario.pdf
 *   node scripts/import-calendar.mjs --file calendario.xlsx --dry-run
 *   node scripts/import-calendar.mjs --file calendario.pdf --season-id <uuid> --our-team "CD Póvoa Masters"
 *
 * Variáveis de ambiente necessárias (ou em web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (ou NEXT_PUBLIC_SUPABASE_ANON_KEY com sessão autenticada)
 */

import { readFileSync, existsSync } from "fs";
import { extname, basename } from "path";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "util";

// ─── Parse CLI args ───────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    file:       { type: "string" },
    "season-id": { type: "string" },
    "our-team": { type: "string", default: "CD Póvoa Masters" },
    "dry-run":  { type: "boolean", default: false },
    "all":      { type: "boolean", default: false },
    help:       { type: "boolean", default: false },
  },
  strict: false,
});

if (args.help || !args.file) {
  console.log(`
  Importador de Calendário INATEL — CD Póvoa Masters

  Uso:
    node scripts/import-calendar.mjs --file <caminho> [opções]

  Opções:
    --file       Caminho para o ficheiro PDF, XLSX, XLS ou CSV
    --season-id  UUID da temporada no Supabase (opcional: usa a ativa)
    --our-team   Nome da nossa equipa (default: "CD Póvoa Masters")
    --dry-run    Simula a importação sem guardar na base de dados
    --all        Importar todos os jogos (não só os nossos)
    --help       Mostrar esta ajuda

  Variáveis de ambiente (em .env ou exportadas):
    NEXT_PUBLIC_SUPABASE_URL       URL do Supabase
    SUPABASE_SERVICE_ROLE_KEY      Service role key (recomendado para scripts)
  `);
  process.exit(0);
}

// ─── Load env ─────────────────────────────────────────────
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Try to load from web/.env.local
  const envPath = new URL("../web/.env.local", import.meta.url).pathname;
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...vals] = line.split("=");
      const val = vals.join("=").trim().replace(/^["']|["']$/g, "");
      if (key?.trim() === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
      if (key?.trim() === "SUPABASE_SERVICE_ROLE_KEY") supabaseKey = val;
      if (key?.trim() === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && !supabaseKey) supabaseKey = val;
    }
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Lazy-load parser (avoid bundling issues) ─────────────
async function getParser() {
  // Load the parser from the web/lib directory
  const parserPath = new URL("../web/lib/calendar-parser.ts", import.meta.url).pathname;
  if (!existsSync(parserPath)) {
    // Fallback: try compiled version
    const { parsePDFText, parseExcelRows, validateParseResult, buildImportPayload, slugTeamName } =
      await import("../web/lib/calendar-parser.js").catch(() => {
        throw new Error("Parser não encontrado. Executa 'npm run build' na pasta web primeiro.");
      });
    return { parsePDFText, parseExcelRows, validateParseResult, buildImportPayload, slugTeamName };
  }
  // TypeScript source — requires tsx or ts-node
  const { parsePDFText, parseExcelRows, validateParseResult, buildImportPayload, slugTeamName } =
    await import("../web/lib/calendar-parser.ts");
  return { parsePDFText, parseExcelRows, validateParseResult, buildImportPayload, slugTeamName };
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  const filePath = args.file;
  if (!existsSync(filePath)) {
    console.error(`❌ Ficheiro não encontrado: ${filePath}`);
    process.exit(1);
  }

  const ext = extname(filePath).slice(1).toLowerCase();
  const filename = basename(filePath);
  const ourTeam = args["our-team"];
  const dryRun = args["dry-run"];
  const importAll = args.all;

  console.log(`\n📂 Ficheiro: ${filename} (${ext.toUpperCase()})`);
  console.log(`👕 Nossa equipa: ${ourTeam}`);
  console.log(`📅 Modo: ${dryRun ? "DRY RUN (simulação)" : "IMPORTAÇÃO REAL"}\n`);

  // Get active season if not provided
  let seasonId = args["season-id"];
  if (!seasonId) {
    const { data: season } = await supabase
      .from("seasons")
      .select("id, name")
      .eq("status", "ativa")
      .single();
    if (!season) {
      console.error("❌ Nenhuma temporada ativa. Usa --season-id <uuid>.");
      process.exit(1);
    }
    seasonId = season.id;
    console.log(`📆 Temporada: ${season.name} (${seasonId})`);
  }

  // Parse file
  const buffer = readFileSync(filePath);
  let parseResult;

  const { parsePDFText, parseExcelRows, validateParseResult, buildImportPayload, slugTeamName } = await getParser();

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const pdfData = await pdfParse(buffer);
    parseResult = parsePDFText(pdfData.text, ourTeam);
  } else if (["xlsx", "xls", "ods"].includes(ext)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const allRows = [];
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
      allRows.push(...rows);
    }
    parseResult = parseExcelRows(allRows, ourTeam);
  } else if (ext === "csv") {
    const text = buffer.toString("utf-8");
    const sep = text.includes(";") ? ";" : ",";
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(sep);
      return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
    });
    parseResult = parseExcelRows(rows, ourTeam);
  } else {
    console.error(`❌ Formato não suportado: .${ext}`);
    process.exit(1);
  }

  // Results
  console.log(`✅ Extraídos: ${parseResult.games.length} jogos | ${parseResult.all_teams.length} equipas | ${parseResult.jornadas_found} jornadas`);

  if (parseResult.errors.length > 0) {
    console.log(`\n⚠️  ${parseResult.errors.length} avisos de parse:`);
    parseResult.errors.slice(0, 10).forEach((e) => console.log(`   • ${e}`));
  }

  // Validate
  const validation = validateParseResult(parseResult);
  if (!validation.valid) {
    console.error("\n❌ Erros de validação:");
    validation.errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }
  if (validation.warnings.length > 0) {
    console.log("\n⚠️  Avisos de validação:");
    validation.warnings.forEach((w) => console.log(`   • ${w}`));
  }

  // Build payload
  const payload = buildImportPayload(parseResult, seasonId, ourTeam, !importAll);

  console.log(`\n📋 A importar:`);
  console.log(`   • ${payload.events_to_create.length} jogos ${importAll ? "(todos)" : "(apenas os nossos)"}`);
  console.log(`   • ${payload.teams_to_create.length} equipas`);

  if (dryRun) {
    console.log("\n🔍 DRY RUN — jogos que seriam importados:");
    payload.events_to_create.slice(0, 20).forEach((e) => {
      console.log(`   J${e.jornada} ${e.event_date} ${e.event_time} — ${e.title}`);
    });
    if (payload.events_to_create.length > 20) {
      console.log(`   ... e mais ${payload.events_to_create.length - 20} jogos`);
    }
    console.log("\n🔍 DRY RUN — equipas que seriam criadas:");
    payload.teams_to_create.forEach((t) => console.log(`   • ${t.name}`));
    console.log("\n✅ Simulação concluída. Remove --dry-run para importar.");
    return;
  }

  // Insert teams
  let teamsCreated = 0;
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
    if (!error) teamsCreated++;
  }

  // Insert events
  let gamesCreated = 0, gamesUpdated = 0, gameErrors = 0;
  for (const evt of payload.events_to_create) {
    if (!evt.event_date) continue;

    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("season_id", evt.season_id)
      .eq("type", "jogo")
      .eq("event_date", evt.event_date)
      .eq("opponent", evt.opponent)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("events")
        .update({ title: evt.title, location: evt.location, event_time: evt.event_time, description: evt.description, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) { gameErrors++; console.error(`   ❌ ${evt.event_date} vs ${evt.opponent}: ${error.message}`); }
      else gamesUpdated++;
    } else {
      const { error } = await supabase.from("events").insert({
        season_id: evt.season_id, type: "jogo",
        title: evt.title, location: evt.location,
        event_date: evt.event_date, event_time: evt.event_time,
        opponent: evt.opponent, description: evt.description,
      });
      if (error) { gameErrors++; console.error(`   ❌ ${evt.event_date} vs ${evt.opponent}: ${error.message}`); }
      else gamesCreated++;
    }
  }

  // Log
  await supabase.from("calendar_imports").insert({
    season_id: seasonId, filename, file_type: ext,
    our_team_name: ourTeam,
    jornadas_found: parseResult.jornadas_found,
    teams_found: parseResult.all_teams.length,
    teams_created: teamsCreated,
    games_found: parseResult.games.length,
    games_created: gamesCreated,
    games_updated: gamesUpdated,
    errors: parseResult.errors,
    raw_games: parseResult.games,
  });

  console.log(`\n✅ Importação concluída:`);
  console.log(`   • Equipas criadas:  ${teamsCreated}`);
  console.log(`   • Jogos criados:    ${gamesCreated}`);
  console.log(`   • Jogos atualizados: ${gamesUpdated}`);
  if (gameErrors > 0) console.log(`   • Erros:           ${gameErrors}`);
}

main().catch((e) => { console.error("❌ Erro:", e.message); process.exit(1); });
