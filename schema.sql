-- =========================================================
-- MASTERS CD PÓVOA — SCHEMA DE BASE DE DADOS (PostgreSQL)
-- =========================================================
-- Para aplicar: psql -U postgres -d masters_cdpovoa -f schema.sql
-- (ou usar o script database/migrate.js)
-- =========================================================
 
-- Extensão usada para gerar UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
 
-- ---------------------------------------------------------
-- TIPOS ENUMERADOS
-- ---------------------------------------------------------
 
CREATE TYPE user_role AS ENUM ('admin', 'treinador', 'jogador');
CREATE TYPE user_status AS ENUM ('pendente', 'ativo', 'rejeitado', 'inativo');
CREATE TYPE season_status AS ENUM ('ativa', 'arquivada');
CREATE TYPE event_type AS ENUM ('jogo', 'treino', 'outro');
CREATE TYPE payment_status AS ENUM ('pago', 'pendente');
CREATE TYPE player_position AS ENUM ('base', 'extremo', 'poste');
 
-- ---------------------------------------------------------
-- TABELA: users
-- Contas de utilizador (admin, treinador, jogador).
-- Conta de jogador nasce "pendente" e só fica "ativo"
-- depois de validação por um administrador.
-- ---------------------------------------------------------
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(120)  NOT NULL,
  email          VARCHAR(160)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255)  NOT NULL,
  role           user_role     NOT NULL DEFAULT 'jogador',
  status         user_status   NOT NULL DEFAULT 'pendente',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_status ON users (status);
 
-- ---------------------------------------------------------
-- TABELA: seasons (temporadas)
-- Apenas uma temporada pode estar "ativa" em simultâneo
-- (garantido por índice único parcial mais abaixo).
-- ---------------------------------------------------------
CREATE TABLE seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,           -- ex: "Masters 2025/26"
  year        VARCHAR(9)   NOT NULL,           -- ex: "2025/2026"
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  status      season_status NOT NULL DEFAULT 'arquivada',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
 
  CONSTRAINT chk_season_dates CHECK (end_date >= start_date)
);
 
-- Garante que existe, no máximo, UMA temporada ativa de cada vez
CREATE UNIQUE INDEX idx_one_active_season
  ON seasons (status)
  WHERE status = 'ativa';
 
-- ---------------------------------------------------------
-- TABELA: player_profiles
-- Dados de plantel de um jogador, associados a UMA temporada
-- (um jogador pode ter um perfil de plantel por cada temporada
-- em que participa: número, posição, etc. podem variar).
-- ---------------------------------------------------------
CREATE TABLE player_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  season_id    UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  jersey_number SMALLINT     CHECK (jersey_number BETWEEN 0 AND 99),
  position     player_position,
  height_cm    SMALLINT      CHECK (height_cm BETWEEN 100 AND 260),
  age          SMALLINT      CHECK (age BETWEEN 10 AND 100),
  photo_path   VARCHAR(255), -- caminho relativo do ficheiro guardado em /uploads
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
 
  CONSTRAINT uq_player_season UNIQUE (user_id, season_id)
);
 
CREATE INDEX idx_player_profiles_season ON player_profiles (season_id);
 
-- ---------------------------------------------------------
-- TABELA: events
-- Calendário: jogos, treinos e outros eventos, sempre
-- associados a uma temporada.
-- ---------------------------------------------------------
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  type         event_type   NOT NULL,
  title        VARCHAR(160) NOT NULL,          -- ex: "Jogo vs. Lions BC" / "Treino tático"
  location     VARCHAR(200) NOT NULL,
  event_date   DATE         NOT NULL,
  event_time   TIME         NOT NULL,
  opponent     VARCHAR(160),                    -- apenas relevante para type = 'jogo'
  training_kind VARCHAR(80),                    -- apenas relevante para type = 'treino' (ex: "físico", "tático")
  description  TEXT,                            -- notas (jogos) ou descrição (outros eventos)
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_events_season ON events (season_id);
CREATE INDEX idx_events_date   ON events (event_date);
CREATE INDEX idx_events_type   ON events (type);
 
-- ---------------------------------------------------------
-- TABELA: payments
-- Cotas mensais de cada jogador, por temporada.
-- ---------------------------------------------------------
CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  season_id     UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  month         SMALLINT     NOT NULL CHECK (month BETWEEN 1 AND 12),
  reference_year SMALLINT    NOT NULL,            -- ano civil a que o mês pertence
  amount        NUMERIC(8,2) NOT NULL CHECK (amount >= 0),
  status        payment_status NOT NULL DEFAULT 'pendente',
  paid_at       TIMESTAMPTZ,
  marked_by     UUID REFERENCES users(id) ON DELETE SET NULL, -- admin que marcou como pago
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
 
  CONSTRAINT uq_payment_month UNIQUE (user_id, season_id, month, reference_year)
);
 
CREATE INDEX idx_payments_user   ON payments (user_id);
CREATE INDEX idx_payments_season ON payments (season_id);
CREATE INDEX idx_payments_status ON payments (status);
 
-- ---------------------------------------------------------
-- TABELA: chat_messages
-- Chat interno simples, visível a todos os autenticados.
-- ---------------------------------------------------------
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_chat_created_at ON chat_messages (created_at);
 
-- ---------------------------------------------------------
-- TABELA: refresh_tokens
-- Suporte a refresh tokens para renovação de sessão JWT.
-- ---------------------------------------------------------
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
 
-- ---------------------------------------------------------
-- FUNÇÃO + TRIGGERS: atualizar "updated_at" automaticamente
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
CREATE TRIGGER trg_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
CREATE TRIGGER trg_player_profiles_updated_at
  BEFORE UPDATE ON player_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
-- =========================================================
-- FIM DO SCHEMA
-- =========================================================
