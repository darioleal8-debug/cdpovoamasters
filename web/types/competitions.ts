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
  team_name: string;
  gp: number;    // jogos disputados
  wins: number;
  losses: number;
  pf: number;    // pontos marcados
  pc: number;    // pontos sofridos
  diff: number;  // diferença
  pts: number;   // pontos (vitória=2, derrota=1 — regras basquetebol INATEL)
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
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Calcula classificação a partir de resultados aprovados.
 *  Regras INATEL basketball: 2 pts vitória, 1 pt derrota */
export function computeStandings(
  results: Pick<LeagueGameResult, "home_team_name" | "away_team_name" | "home_score" | "away_score">[]
): StandingRow[] {
  const map = new Map<string, StandingRow>();

  function get(name: string): StandingRow {
    if (!map.has(name)) {
      map.set(name, { team_name: name, gp: 0, wins: 0, losses: 0, pf: 0, pc: 0, diff: 0, pts: 0 });
    }
    return map.get(name)!;
  }

  for (const r of results) {
    const home = get(r.home_team_name);
    const away = get(r.away_team_name);
    const homeWin = r.home_score > r.away_score;

    home.gp++;  home.pf += r.home_score;  home.pc += r.away_score;
    away.gp++;  away.pf += r.away_score;  away.pc += r.home_score;

    if (homeWin) {
      home.wins++;  home.pts += 2;
      away.losses++; away.pts += 1;
    } else {
      away.wins++;  away.pts += 2;
      home.losses++; home.pts += 1;
    }
  }

  return Array.from(map.values())
    .map(s => ({ ...s, diff: s.pf - s.pc }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.pf - a.pf);
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
    };
  } catch {
    return null;
  }
}
