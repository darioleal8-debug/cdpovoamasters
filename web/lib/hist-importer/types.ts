/** Estatísticas brutas extraídas pelo DeepSeek para um jogador histórico */
export interface HistExtractedPlayer {
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

/** Metadados do jogo extraídos pelo DeepSeek */
export interface HistGameMeta {
  game_date: string | null;        // "YYYY-MM-DD" ou null
  opponent_name: string | null;
  home_score: number | null;
  away_score: number | null;
  competition: string | null;
  team_name: string | null;
}

export type HistMatchStatus = "ok" | "ambiguous" | "new";

export interface HistCandidate {
  id: string;   // hist_players.id
  name: string;
}

/** Resultado de matching para um jogador extraído */
export interface HistMatchedRow {
  extracted: HistExtractedPlayer;
  hist_player_id: string | null;
  hist_player_name: string | null;
  match_type: "name" | "number+name" | "none";
  status: HistMatchStatus;     // "ok" | "ambiguous" | "new" (será criado)
  candidates: HistCandidate[];
  new_player_name: string;     // editável quando status="new"
  include: boolean;
}

/** Resultado completo da análise do PDF histórico */
export interface HistImportAnalysis {
  rows: HistMatchedRow[];
  game_meta: HistGameMeta;
  ai_log: string;
  errors: string[];
}

export interface HistConfirmAssignment {
  hist_player_id: string | null;   // null → criar novo hist_player
  new_player_name: string;
  jersey_number: number | null;
  stats: Omit<HistExtractedPlayer, "pdf_name" | "pdf_number">;
}

export interface HistConfirmPayload {
  hist_season_id: string;
  game_meta: HistGameMeta;
  pdf_filename: string;
  assignments: HistConfirmAssignment[];
}

export interface HistConfirmResult {
  hist_game_id: string;
  imported: number;
  new_players: number;
  skipped: number;
  errors: string[];
}

/** Linha da tabela "Histórico de Jogadores" */
export interface HistPlayerSeasonRow {
  player_id: string;
  player_name: string;
  season_id: string;
  season_label: string;
  games: number;
  total_pts: number;
  total_reb: number;
  total_ast: number;
  total_stl: number;
  total_blk: number;
  total_tov: number;
  avg_pts: number;
  avg_reb: number;
  avg_ast: number;
  avg_eff: number;
}

/** Linha da tabela "Histórico de Jogos" */
export interface HistGameRow {
  id: string;
  season_id: string;
  season_label: string;
  game_date: string | null;
  opponent_name: string | null;
  home_score: number | null;
  away_score: number | null;
  competition: string | null;
  player_count: number;
  created_at: string;
}
