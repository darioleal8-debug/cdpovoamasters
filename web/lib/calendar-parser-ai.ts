/**
 * Parser com IA — Calendário INATEL Porto
 *
 * Usa Claude API para interpretação semântica do texto extraído de PDF/Excel,
 * corrigindo erros de OCR, tabelas desalinhadas e formatações inconsistentes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { slugTeamName, type ParseResult, type RawGame } from "./calendar-parser";

// ─── Types ────────────────────────────────────────────────

export interface AIGame {
  jornada: number;
  jogo_num: number;
  home_team: string;
  away_team: string;
  date: string | null;
  time: string | null;
  pavilion: string;
  locality: string;
  is_our_game: boolean;
  is_home: boolean;
  corrections_applied?: string[];
}

export interface AITeam {
  name: string;
  normalized_name: string;
  home_pavilion: string | null;
  locality: string | null;
  ccd_number?: string | null;
  contact?: string | null;
}

export interface AIParseResponse {
  jornadas_found: number;
  games: AIGame[];
  teams: AITeam[];
  errors: string[];
  warnings: string[];
}

// ─── System Prompt ────────────────────────────────────────

const SYSTEM_PROMPT = `
Você é um especialista em leitura de calendários da Liga INATEL Porto de basquetebol masculino (Portugal).

A sua tarefa é extrair dados estruturados de texto bruto que pode conter:
- Erros de OCR (caracteres trocados, palavras partidas, espaços incorretos)
- Tabelas desalinhadas ou colunas partidas
- Datas em múltiplos formatos portugueses
- Horas com caracteres estranhos
- Nomes de pavilhões truncados ou partidos
- Jornadas sem título claro

FORMATO PADRÃO INATEL (colunas em ordem):
JOGO Nº | VISITADO (equipa da casa) | VISITANTE (equipa de fora) | DATA | HORA | PAVILHÃO | LOCAL

REGRAS DE CORREÇÃO DE OCR (aplica sempre):
- "P av." / "P.av." → "Pav."
- "1:45" quando claramente é à noite → "21:45"
- "2:00" quando claramente é à noite → "22:00"
- "B )aga" → "Braga"
- "G im nasio" → "Ginásio"
- "M unicipal" → "Municipal"
- "P ov oa" / "Pov." → "Póvoa"
- "M atosinhos" / "M atos." → "Matosinhos"
- Caracteres "|" isolados no meio de texto → ignorar
- "C.D." → "CD", "C.A." → "CA", "G.D." → "GD", "S.C." → "SC", "A.D." → "AD"
- Espaços a meio de palavras: "C D Pov oa" → "CD Póvoa"
- "Pov. Varzim" → "Póvoa de Varzim"
- Números no início de linha que são nº do jogo: extrair corretamente

REGRAS DE NORMALIZAÇÃO:
- Datas: converter para YYYY-MM-DD (ex: "qui, 20/11/2025" → "2025-11-20")
- Horas: converter para HH:mm em formato 24h
- Nomes de equipas: título case, sem abreviações desnecessárias
- Se jornada não tiver título, deduzir pela sequência
- Se hora for ambígua (ex: "9:00"), deduzir pelo contexto (jogos INATEL são tipicamente às 21:00-22:00)
- Unificar equipas com nomes ligeiramente diferentes (ex: "CD Póvoa" e "CD Póvoa Masters" → são a mesma)

RETORNA APENAS JSON VÁLIDO, sem markdown, sem explicações.
`.trim();

// ─── Chunk helpers ────────────────────────────────────────

const MAX_CHUNK_CHARS = 60_000; // safe limit per API call

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const chunks: string[] = [];
  // Try to split at jornada boundaries
  const parts = text.split(/(?=(?:JORNADA|Jornada)\s+\d+)/);

  let current = "";
  for (const part of parts) {
    if ((current + part).length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);

  return chunks.length > 0 ? chunks : [text.slice(0, MAX_CHUNK_CHARS)];
}

// ─── Main AI Parser ───────────────────────────────────────

export async function parseCalendarWithAI(
  rawText: string,
  ourTeam: string = "CD Póvoa Masters",
  apiKey?: string
): Promise<ParseResult & { corrections: string[] }> {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY não configurada. Adiciona ao ficheiro .env.local");
  }

  const client = new Anthropic({ apiKey: key });
  const chunks = chunkText(rawText.trim());

  const allGames: AIGame[] = [];
  const allTeams: AITeam[] = [];
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const allCorrections: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isMultiChunk = chunks.length > 1;

    const userPrompt = `
Extrai todos os jogos e equipas do seguinte texto de calendário INATEL.
A nossa equipa chama-se: "${ourTeam}"
${isMultiChunk ? `\n(Esta é a parte ${i + 1} de ${chunks.length} do documento)` : ""}

TEXTO BRUTO:
---
${chunk}
---

Responde com este JSON exato:
{
  "jornadas_found": <número máximo de jornada encontrada>,
  "games": [
    {
      "jornada": <número inteiro>,
      "jogo_num": <número inteiro>,
      "home_team": "<nome oficial da equipa da casa>",
      "away_team": "<nome oficial da equipa visitante>",
      "date": "<YYYY-MM-DD ou null>",
      "time": "<HH:mm ou null>",
      "pavilion": "<nome do pavilhão corrigido>",
      "locality": "<localidade>",
      "is_our_game": <true/false — envolve a nossa equipa>,
      "is_home": <true/false — a nossa equipa joga em casa>,
      "corrections_applied": ["<correção 1>", "<correção 2>"]
    }
  ],
  "teams": [
    {
      "name": "<nome oficial>",
      "normalized_name": "<minúsculas sem acentos>",
      "home_pavilion": "<pavilhão principal ou null>",
      "locality": "<localidade ou null>",
      "ccd_number": "<nº CCD ou null>",
      "contact": "<contacto ou null>"
    }
  ],
  "errors": ["<problema encontrado>"],
  "warnings": ["<aviso>"]
}`.trim();

    let response: AIParseResponse;

    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const content = message.content[0];
      if (content.type !== "text") {
        allErrors.push(`Chunk ${i + 1}: resposta inesperada da IA`);
        continue;
      }

      // Extract JSON from response (handle possible markdown code blocks)
      let jsonText = content.text.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (jsonMatch) jsonText = jsonMatch[1];

      response = JSON.parse(jsonText) as AIParseResponse;
    } catch (e) {
      allErrors.push(`Chunk ${i + 1}: erro ao processar com IA — ${(e as Error).message}`);
      continue;
    }

    // Collect results
    for (const game of response.games ?? []) {
      allGames.push(game);
      if (game.corrections_applied?.length) {
        allCorrections.push(...game.corrections_applied);
      }
    }

    for (const team of response.teams ?? []) {
      // Deduplicate by normalized_name
      const existing = allTeams.find(
        (t) => t.normalized_name === (team.normalized_name || slugTeamName(team.name))
      );
      if (!existing) {
        allTeams.push({
          ...team,
          normalized_name: team.normalized_name || slugTeamName(team.name),
        });
      } else {
        // Merge: fill in missing fields
        if (!existing.home_pavilion && team.home_pavilion) existing.home_pavilion = team.home_pavilion;
        if (!existing.locality && team.locality) existing.locality = team.locality;
        if (!existing.ccd_number && team.ccd_number) existing.ccd_number = team.ccd_number;
        if (!existing.contact && team.contact) existing.contact = team.contact;
      }
    }

    allErrors.push(...(response.errors ?? []));
    allWarnings.push(...(response.warnings ?? []));
  }

  // Deduplicate games
  const seenGames = new Set<string>();
  const uniqueGames: RawGame[] = [];

  for (const g of allGames) {
    const key = `${g.date}|${g.home_team}|${g.away_team}`;
    if (seenGames.has(key)) {
      allWarnings.push(`Jogo duplicado removido: ${g.home_team} vs ${g.away_team} em ${g.date}`);
      continue;
    }
    seenGames.add(key);

    uniqueGames.push({
      jornada: g.jornada ?? 0,
      jogo_num: g.jogo_num ?? 0,
      home_team: g.home_team,
      away_team: g.away_team,
      date_raw: g.date ?? "",
      date: g.date,
      time: g.time,
      pavilion: g.pavilion ?? "",
      locality: g.locality ?? "",
      is_our_game: g.is_our_game ?? false,
      is_home: g.is_home ?? false,
    });
  }

  // Sort by jornada then jogo_num
  uniqueGames.sort((a, b) => a.jornada - b.jornada || a.jogo_num - b.jogo_num);

  const jornadasFound = uniqueGames.length > 0
    ? Math.max(...uniqueGames.map((g) => g.jornada))
    : 0;

  const uniqueTeamNames = [...new Set(
    uniqueGames.flatMap((g) => [g.home_team, g.away_team])
  )].sort();

  return {
    games: uniqueGames,
    all_teams: uniqueTeamNames,
    jornadas_found: jornadasFound,
    errors: allErrors,
    corrections: [...new Set(allCorrections)],
    // Attach enriched team data for use in the API route
    _ai_teams: allTeams,
  } as ParseResult & { corrections: string[]; _ai_teams: AITeam[] };
}

// ─── Generate detailed JSON report ───────────────────────

export interface ImportReport {
  teams: AITeam[];
  games: Array<{
    jornada: number;
    jogo_num: number;
    home_team: string;
    away_team: string;
    date: string | null;
    time: string | null;
    pavilion: string;
    locality: string;
    is_our_game: boolean;
    is_home: boolean;
  }>;
  summary: {
    jornadas: number;
    total_games: number;
    our_games: number;
    total_teams: number;
  };
  errors: string[];
  warnings: string[];
  corrections: string[];
}

export function buildReport(
  result: ParseResult & { corrections?: string[]; _ai_teams?: AITeam[] }
): ImportReport {
  const aiTeams: AITeam[] = (result as { _ai_teams?: AITeam[] })._ai_teams ?? [];

  // If no AI teams, build minimal team list from game data
  const teams: AITeam[] =
    aiTeams.length > 0
      ? aiTeams
      : (result.all_teams ?? []).map((name) => {
          const asHome = result.games.find((g) => g.home_team === name);
          return {
            name,
            normalized_name: slugTeamName(name),
            home_pavilion: asHome?.pavilion ?? null,
            locality: asHome?.locality ?? null,
            ccd_number: null,
            contact: null,
          };
        });

  return {
    teams,
    games: result.games.map((g) => ({
      jornada: g.jornada,
      jogo_num: g.jogo_num,
      home_team: g.home_team,
      away_team: g.away_team,
      date: g.date,
      time: g.time,
      pavilion: g.pavilion,
      locality: g.locality,
      is_our_game: g.is_our_game,
      is_home: g.is_home,
    })),
    summary: {
      jornadas: result.jornadas_found,
      total_games: result.games.length,
      our_games: result.games.filter((g) => g.is_our_game).length,
      total_teams: teams.length,
    },
    errors: result.errors,
    warnings: [],
    corrections: result.corrections ?? [],
  };
}

// ─── Generate SQL inserts ─────────────────────────────────

export function generateSQL(
  report: ImportReport,
  seasonId: string,
  ourTeamName: string
): string {
  const lines: string[] = [
    "-- ================================================",
    "-- Gerado por CD Póvoa Masters — Importador INATEL",
    `-- Data: ${new Date().toISOString()}`,
    "-- ================================================",
    "",
    "-- EQUIPAS",
  ];

  for (const team of report.teams) {
    const esc = (s: string | null | undefined) =>
      s ? `'${s.replace(/'/g, "''")}'` : "NULL";
    lines.push(
      `INSERT INTO league_teams (name, normalized_name, home_pavilion, locality, is_our_team)` +
        ` VALUES (${esc(team.name)}, ${esc(team.normalized_name)}, ${esc(team.home_pavilion)}, ${esc(team.locality)}, ${team.normalized_name === slugTeamName(ourTeamName)})` +
        ` ON CONFLICT (normalized_name) DO NOTHING;`
    );
  }

  lines.push("", "-- JOGOS (events)");

  for (const g of report.games) {
    if (!g.is_our_game || !g.date) continue;
    const opponent = g.is_home ? g.away_team : g.home_team;
    const homeAway = g.is_home ? "Casa" : "Fora";
    const title = `J${g.jornada} • ${ourTeamName} vs ${opponent} (${homeAway})`;
    const location = [g.pavilion, g.locality].filter(Boolean).join(" — ");
    const esc = (s: string | null | undefined) =>
      s ? `'${s.replace(/'/g, "''")}'` : "NULL";

    lines.push(
      `INSERT INTO events (season_id, type, title, location, event_date, event_time, opponent)` +
        ` VALUES ('${seasonId}', 'jogo', ${esc(title)}, ${esc(location)}, '${g.date}', '${g.time ?? "00:00"}', ${esc(opponent)})` +
        ` ON CONFLICT DO NOTHING;`
    );
  }

  return lines.join("\n");
}
