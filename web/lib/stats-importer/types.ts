/** Estatísticas brutas extraídas do PDF para um jogador */
export interface ExtractedPlayerStats {
  pdf_name: string;
  pdf_number: number | null;
  seconds_played: number;
  fg2_made: number;
  fg2_att: number;
  fg3_made: number;
  fg3_att: number;
  ft_made: number;
  ft_att: number;
  reb_off: number;
  reb_def: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls_committed: number;
  fouls_drawn: number;
  pts: number;
  plus_minus: number | null;
}

export type MatchStatus = "ok" | "ambiguous" | "unmatched";

export interface RosterCandidate {
  id: string;          // players.id
  name: string;
  number: number | null;
}

/** Linha do resultado: jogador extraído + match no plantel */
export interface MatchedRow {
  extracted: ExtractedPlayerStats;
  player_id: string | null;
  player_name: string | null;
  player_number: number | null;
  match_type: "number" | "name" | "none";
  status: MatchStatus;
  candidates: RosterCandidate[];
  include: boolean;
}

/** Resultado completo da análise do PDF */
export interface ImportAnalysis {
  rows: MatchedRow[];
  pdf_home_team: string | null;
  pdf_opponent: string | null;
  pdf_home_score: number | null;
  pdf_away_score: number | null;
  ai_log: string;
  errors: string[];
}

export interface ConfirmAssignment {
  player_id: string;
  stats: Omit<ExtractedPlayerStats, "pdf_name" | "pdf_number">;
}

export interface ConfirmPayload {
  session_id: string;
  mode: "replace" | "merge";
  update_score: boolean;
  home_score: number | null;
  away_score: number | null;
  assignments: ConfirmAssignment[];
}

export interface ConfirmResult {
  imported: number;
  skipped: number;
  errors: string[];
}
