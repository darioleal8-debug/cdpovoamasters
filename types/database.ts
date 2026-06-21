// Gerado a partir de database/schema.sql — actualizar sempre que o schema mudar.

export type UserRole = "admin" | "treinador" | "jogador";
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
