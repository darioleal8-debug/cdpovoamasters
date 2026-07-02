// Gerado a partir de database/schema.sql — actualizar sempre que o schema mudar.

export type UserRole = "admin" | "treinador" | "jogador" | "seccionista";
export type UserStatus = "pendente" | "ativo" | "rejeitado" | "inativo";
export type SeasonStatus = "ativa" | "arquivada";
export type EventType = "jogo" | "treino" | "outro";
export type PaymentStatus = "pago" | "pendente";
export type PlayerPosition = "base" | "extremo" | "poste";

// ── Tabelas ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  name: string;
  year: string;
  start_date: string;
  end_date: string;
  status: SeasonStatus;
  created_at: string;
  updated_at: string;
}

export interface PlayerProfile {
  id: string;
  user_id: string;
  season_id: string;
  jersey_number: number | null;
  position: PlayerPosition | null;
  height_cm: number | null;
  age: number | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  season_id: string;
  type: EventType;
  title: string;
  location: string;
  event_date: string;
  event_time: string;
  opponent: string | null;
  training_kind: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  season_id: string;
  month: number;
  reference_year: number;
  amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  marked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export type ChatType = "direct" | "group" | "team" | "announcement";
export type ChatPostPolicy = "all" | "admin_only";

export interface ChatThreadSummary {
  id: string;
  type: ChatType;
  name: string | null;
  post_policy: ChatPostPolicy;
  last_message: { content: string; sender_id: string | null; created_at: string } | null;
  unread_count: number;
  updated_at: string;
}

export interface ChatThreadMessage {
  id: string;
  chat_id: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  attachment_url: string | null;
  created_at: string;
}

// ── Joins frequentes (views/queries com relacionamentos) ───────────────────

export interface PlayerWithUser extends PlayerProfile {
  user: Pick<User, "id" | "name" | "email" | "status">;
}

export interface PaymentWithUser extends Payment {
  user: Pick<User, "id" | "name" | "email">;
}

export interface EventWithCreator extends Event {
  creator: Pick<User, "id" | "name"> | null;
}

// ── Tipos de formulário (para criação/edição) ──────────────────────────────

export type PlayerFormData = {
  user_id: string;
  season_id: string;
  jersey_number?: number;
  position?: PlayerPosition;
  height_cm?: number;
  age?: number;
};

export type GameFormData = {
  season_id: string;
  title: string;
  location: string;
  event_date: string;
  event_time: string;
  opponent?: string;
  description?: string;
};

export type TrainingFormData = {
  season_id: string;
  title: string;
  location: string;
  event_date: string;
  event_time: string;
  training_kind?: string;
  description?: string;
};

export type PaymentFormData = {
  user_id: string;
  season_id: string;
  month: number;
  reference_year: number;
  amount: number;
  status: PaymentStatus;
};

export type SeasonFormData = {
  name: string;
  year: string;
  start_date: string;
  end_date: string;
};

// ── Métricas do dashboard ──────────────────────────────────────────────────

export interface DashboardMetrics {
  totalPlayers: number;
  totalGames: number;
  pendingPayments: number;
  activeSeason: Season | null;
}

export interface AttendanceDataPoint {
  month: string;
  jogos: number;
  treinos: number;
}

export interface PaymentDataPoint {
  month: string;
  pago: number;
  pendente: number;
}

export interface PositionCount {
  name: string;
  value: number;
  fill: string;
}

// ── Plantel (tabela players) ──────────────────────────────────────────────

export interface Player {
  id:         string;
  season_id:  string;
  team_id:    string | null;
  user_id:    string | null;
  name:       string;
  number:     number | null;
  position:   PlayerPosition | null;
  height:     number | null;
  weight:     number | null;
  age:        number | null;
  phone:      string | null;
  birth_date: string | null;
  photo_url:  string | null;
  created_at: string;
}

// ── Cores de equipamento por equipa (tabela team_kits) ───────────────────────

export interface TeamKit {
  id:                string;
  team_name:         string;
  jersey_home_color: string;
  shorts_home_color: string;
  jersey_away_color: string;
  shorts_away_color: string;
  notes:             string | null;
  updated_by:        string | null;
  updated_at:        string;
}

export type TeamKitFormData = Omit<TeamKit, "id" | "updated_by" | "updated_at">;

// ── Pagamentos avançados por jogador (tabela player_payments) ────────────────

export type PlayerPaymentStatus = "paid" | "partial" | "late" | "exempt";
export type PlayerPaymentMethod = "mbway" | "transferencia" | "numerario" | "cheque" | "outro";

export interface PlayerPayment {
  id: string;
  season_id: string;
  player_id: string;
  month: number;
  reference_year: number;
  amount: number;
  amount_due: number;
  status: PlayerPaymentStatus;
  method: PlayerPaymentMethod | null;
  notes: string | null;
  payment_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerPaymentWithPlayer extends PlayerPayment {
  player: Pick<Player, "id" | "name" | "number">;
}

export interface PlayerPaymentSummary {
  player_id: string;
  season_id: string;
  total_months: number;
  months_paid: number;
  months_partial: number;
  months_late: number;
  months_exempt: number;
  total_paid: number;
  total_due: number;
  total_missing: number;
  compliance_pct: number | null;
}

export const PLAYER_PAYMENT_STATUS_LABELS: Record<PlayerPaymentStatus, string> = {
  paid:    "Pago",
  partial: "Parcial",
  late:    "Em atraso",
  exempt:  "Isento",
};

export const PLAYER_PAYMENT_METHOD_LABELS: Record<PlayerPaymentMethod, string> = {
  mbway:        "MB Way",
  transferencia:"Transferência",
  numerario:    "Numerário",
  cheque:       "Cheque",
  outro:        "Outro",
};

export const MONTH_NAMES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

// ── Estatísticas de Jogo ───────────────────────────────────────────────────

export type GameStatus = "scheduled" | "live" | "finished";

export interface GameCurrentLineup {
  game_session_id: string;
  on_court_ids: string[];
  updated_at: string;
}

export interface PlayerCourtStint {
  id: string;
  game_session_id: string;
  player_id: string;
  period: number;
  entry_clock_secs: number;
  exit_clock_secs: number | null;
  entry_home_score: number;
  entry_away_score: number;
  exit_home_score: number | null;
  exit_away_score: number | null;
  created_at: string;
}

export type PlayEventType =
  | "2pt_made" | "2pt_miss"
  | "3pt_made" | "3pt_miss"
  | "ft_made"  | "ft_miss"
  | "rebound_off" | "rebound_def"
  | "assist" | "steal" | "block" | "turnover"
  | "foul_committed" | "foul_drawn"
  | "substitution_in" | "substitution_out"
  | "timeout"
  | "period_start" | "period_end"
  | "game_start" | "game_end";

export interface GameSession {
  id: string;
  event_id: string;
  season_id: string;
  status: GameStatus;
  current_period: number;
  home_score: number;
  away_score: number;
  opponent_name: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  // Clock control (migration 003)
  clock_running: boolean;
  clock_started_at: string | null;
  clock_elapsed_secs: number;
  period_duration_secs: number;
  home_timeouts_left: number;
  away_timeouts_left: number;
}

export interface PlayByPlay {
  id: string;
  game_session_id: string;
  season_id: string;
  period: number;
  game_clock: string;
  event_type: PlayEventType;
  player_id: string | null;
  secondary_player_id: string | null;
  is_home_team: boolean;
  points_delta: number;
  home_score_after: number;
  away_score_after: number;
  shot_x: number | null;
  shot_y: number | null;
  shot_zone: string | null;
  description: string | null;
  created_at: string;
}

export interface PlayerGameStats {
  id: string;
  game_session_id: string;
  season_id: string;
  player_id: string;
  minutes_played: number;
  pts: number;
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
  plus_minus: number;
  efficiency: number;
  seconds_played: number;
  created_at: string;
  updated_at: string;
}

export interface PlayerGameStatsWithUser extends PlayerGameStats {
  user: Pick<User, "id" | "name">;
}

export interface GamePeriodScore {
  id: string;
  game_session_id: string;
  period: number;
  home_score: number;
  away_score: number;
}

export interface PlayByPlayWithPlayers extends PlayByPlay {
  player: Pick<User, "id" | "name"> | null;
  secondary_player: Pick<User, "id" | "name"> | null;
}

// ── Treinos & Presenças ───────────────────────────────────────────────────────

export type TrainingType =
  | "tecnico" | "fisico" | "tatico"
  | "recuperacao" | "coletivo" | "individual" | "geral";

export type AttendanceStatus = "present" | "absent" | "justified" | "late";

export type RecurrenceType = "weekly" | "monthly" | "unique";

export interface TrainingRecurrenceRule {
  id: string;
  season_id: string;
  recurrence_type: RecurrenceType;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  type: TrainingType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Training {
  id: string;
  season_id: string;
  recurrence_id: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  location: string;
  type: TrainingType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TrainingAttendance {
  id: string;
  training_id: string;
  player_id: string;
  status: AttendanceStatus;
  updated_at: string;
  updated_by: string | null;
}

export interface TrainingNote {
  id: string;
  training_id: string;
  author_id: string | null;
  note_text: string;
  created_at: string;
  updated_at: string;
}

// ── Convocatórias de jogo (tabela game_callups) ───────────────────────────

export interface GameCallup {
  id: string;
  game_id: string;
  player_id: string;
  created_at: string;
  player: Pick<Player, "id" | "name" | "number" | "position" | "photo_url">;
}

export interface ClubEvent {
  id: string;
  season_id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  location: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlayerAttendanceStat {
  player_id: string;
  season_id: string;
  total_trainings: number;
  present: number;
  absent: number;
  justified: number;
  late: number;
  attendance_pct: number;
}

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  tecnico:     "Técnico",
  fisico:      "Físico",
  tatico:      "Tático",
  recuperacao: "Recuperação",
  coletivo:    "Coletivo",
  individual:  "Individual",
  geral:       "Geral",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present:   "Presente",
  absent:    "Falta",
  justified: "Justificada",
  late:      "Atraso",
};

// ── Evento a registar (input do treinador) ────────────────────────────────────
export interface RecordPlayInput {
  event_type: PlayEventType;
  player_id?: string;
  secondary_player_id?: string;
  shot_x?: number;
  shot_y?: number;
  shot_zone?: string;
  game_clock?: string;
}
