// ─── Tipos para o sistema de competições públicas ─────────────────────────────

export interface LeagueTeam {
  id: string;
  name: string;
  normalized_name: string;
  slug: string | null;
  short_name: string | null;
  sigla: string | null;
  logo_url: string | null;
  home_pavilion: string | null;
  locality: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  ccd_number: string | null;
  is_our_team: boolean;
  is_placeholder: boolean;
  created_at: string;
  updated_at: string;
}


export interface Competition {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  logo_url: string | null;
  description: string | null;
  competition_key: string | null; // 'Liga' | 'Taça' — liga com events.competition
  season_id: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeagueGameResult {
  id: string;
  event_id: string;
  competition_id: string | null;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  jornada: number | null;
  volta: number | null;
  approved_at: string;
  approved_by: string | null;
  created_at: string;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface ResultSubmission {
  id: string;
  event_id: string;
  competition_id: string | null;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  submitted_by_name: string;
  submitted_by_team: string | null;
  submitted_by_contact: string | null;
  notes: string | null;
  submitted_at: string;
  status: SubmissionStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
}

// Resultado calculado para a classificação (computado em TypeScript)
export interface StandingRow {
  team_id?: string | null; // uuid da league_teams, presente quando seedTeams fornecido
  team_name: string;
  gp: number;    // jogos disputados
  wins: number;
  draws: number;
  losses: number;
  pf: number;    // pontos marcados
  pc: number;    // pontos sofridos
  diff: number;  // diferença
  pts: number;   // pontos (vitória=3, empate=1, derrota=0 — regulamento Liga INATEL)
}

// Jogo público (calendar + result merged)
export type GameResultStatus = "no_result" | "pending" | "live" | "approved";

export interface PublicGame {
  id: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  home_team: string;
  away_team: string;
  jornada: number | null;
  volta: number | null;
  syntheticJornada: number; // globally unique across voltas
  result: { home_score: number; away_score: number } | null;
  result_status: GameResultStatus;
  pending_count: number;        // quantas submissões pendentes existem para este jogo
  live_game_url: string | null; // /live/[session_id] se ao vivo
  is_our_game: boolean;         // envolve CD Póvoa Masters
  is_test: boolean;             // jogo de teste — não mostrar em páginas públicas
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Remove acentos, lowercase, só alfanumérico + espaços simples */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Calcula classificação a partir de resultados aprovados.
 *  Regulamento Liga INATEL: vitória 3 pts, empate 1 pt, derrota 0 pts.
 *  seedTeams: todas as equipas não-placeholder — garante que equipas sem jogos aparecem a zero. */
/** Pontuação da classificação (regulamento Liga INATEL). */
export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;

export function computeStandings(
  results: Pick<LeagueGameResult, "home_team_name" | "away_team_name" | "home_score" | "away_score">[],
  seedTeams?: Pick<LeagueTeam, "id" | "name" | "normalized_name">[]
): StandingRow[] {
  // key = team_id (se seed) ou normalizeName(name) (fallback)
  const map = new Map<string, StandingRow>();
  // normalized_name → team_id para resolução de variantes de nome
  const normToId = new Map<string, string>();

  if (seedTeams) {
    for (const t of seedTeams) {
      map.set(t.id, { team_id: t.id, team_name: t.name, gp: 0, wins: 0, draws: 0, losses: 0, pf: 0, pc: 0, diff: 0, pts: 0 });
      normToId.set(t.normalized_name, t.id);
      normToId.set(normalizeName(t.name), t.id);
    }
  }

  function get(name: string): StandingRow {
    if (seedTeams) {
      const teamId = normToId.get(normalizeName(name));
      if (teamId && map.has(teamId)) return map.get(teamId)!;
    }
    const fallbackKey = normalizeName(name);
    if (!map.has(fallbackKey)) {
      map.set(fallbackKey, { team_name: name, gp: 0, wins: 0, draws: 0, losses: 0, pf: 0, pc: 0, diff: 0, pts: 0 });
    }
    return map.get(fallbackKey)!;
  }

  for (const r of results) {
    const home = get(r.home_team_name);
    const away = get(r.away_team_name);
    home.gp++;  home.pf += r.home_score;  home.pc += r.away_score;
    away.gp++;  away.pf += r.away_score;  away.pc += r.home_score;

    if (r.home_score > r.away_score) {
      home.wins++;   home.pts += POINTS_WIN;
      away.losses++; away.pts += POINTS_LOSS;
    } else if (r.home_score < r.away_score) {
      away.wins++;   away.pts += POINTS_WIN;
      home.losses++; home.pts += POINTS_LOSS;
    } else {
      home.draws++;  home.pts += POINTS_DRAW;
      away.draws++;  away.pts += POINTS_DRAW;
    }
  }

  return Array.from(map.values())
    .map(s => ({ ...s, diff: s.pf - s.pc }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.pf - a.pf);
}

// ─── Séries (grupos) ──────────────────────────────────────────────────────────

export interface SeriesStandings<T extends StandingRow = StandingRow> {
  /** Letra da série ("A", "B", …) ou null para equipas sem série atribuída */
  series: string | null;
  /** Rótulo a mostrar: "Série A" ou "Sem série" */
  label: string;
  rows: T[];
}

export function seriesLabel(series: string | null): string {
  return series ? `Série ${series}` : "Sem série";
}

/**
 * Divide uma classificação já ordenada em séries, mantendo a ordem dentro de cada uma.
 * As séries aparecem por ordem alfabética; equipas sem série vão para o fim
 * (e só aparecem se existirem).
 */
export function groupStandingsBySeries<T extends StandingRow>(
  rows: T[],
  seriesByTeamId: Map<string, string | null>
): SeriesStandings<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const row of rows) {
    const s = row.team_id ? seriesByTeamId.get(row.team_id) ?? null : null;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(row);
  }
  // Séries sem jogos ainda também aparecem (ex.: início de época)
  for (const s of new Set(seriesByTeamId.values())) {
    if (!groups.has(s)) groups.set(s, []);
  }
  return Array.from(groups.entries())
    .filter(([s, r]) => s !== null || r.length > 0)
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([series, r]) => ({ series, label: seriesLabel(series), rows: r }));
}

/** Parse do campo description (JSON) dos eventos */
export interface GameMeta {
  jornada?: number;
  volta?: number;
  home_team?: string;
  away_team?: string;
  pavilion?: string;
  locality?: string;
  is_home?: boolean;
  jogo_num?: number;
  serie?: string;
  is_test?: boolean;
}

export function parseGameMeta(description: string | null): GameMeta | null {
  if (!description) return null;
  try {
    const m = JSON.parse(description) as Partial<GameMeta>;
    if (!m.home_team || !m.away_team) return null;
    return {
      jornada:  m.jornada  ? Number(m.jornada)  : undefined,
      volta:    m.volta    ? Number(m.volta)    : undefined,
      jogo_num: m.jogo_num ? Number(m.jogo_num) : undefined,
      home_team: m.home_team,
      away_team: m.away_team,
      pavilion:  m.pavilion  ?? undefined,
      locality:  m.locality  ?? undefined,
      is_home:   Boolean(m.is_home),
      serie:     m.serie ?? undefined,
      is_test:   m.is_test === true,
    };
  } catch {
    return null;
  }
}
