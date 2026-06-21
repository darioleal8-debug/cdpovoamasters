-- =========================================================
-- MASTERS CD PÓVOA — SCHEMA SUPABASE
-- Aplicar no Supabase: Dashboard > SQL Editor > New Query
-- =========================================================
-- NOTA: O Supabase gere autenticação via auth.users.
-- A tabela "users" aqui estende auth.users com campos do clube.
-- =========================================================

-- Tipos enumerados
CREATE TYPE user_role       AS ENUM ('admin', 'treinador', 'jogador');
CREATE TYPE user_status     AS ENUM ('pendente', 'ativo', 'rejeitado', 'inativo');
CREATE TYPE season_status   AS ENUM ('ativa', 'arquivada');
CREATE TYPE event_type      AS ENUM ('jogo', 'treino', 'outro');
CREATE TYPE payment_status  AS ENUM ('pago', 'pendente');
CREATE TYPE player_position AS ENUM ('base', 'extremo', 'poste');

-- ─── TABELA: users ───────────────────────────────────────────
-- Estende auth.users com dados específicos do clube.
-- O campo "email" é usado para ligar ao utilizador autenticado.
CREATE TABLE public.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(160) NOT NULL UNIQUE,
  name         VARCHAR(120) NOT NULL,
  role         user_role    NOT NULL DEFAULT 'jogador',
  status       user_status  NOT NULL DEFAULT 'pendente',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role   ON public.users (role);
CREATE INDEX idx_users_status ON public.users (status);

-- ─── TABELA: seasons ─────────────────────────────────────────
CREATE TABLE public.seasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120)  NOT NULL,
  year       VARCHAR(9)    NOT NULL,
  start_date DATE          NOT NULL,
  end_date   DATE          NOT NULL,
  status     season_status NOT NULL DEFAULT 'arquivada',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT chk_season_dates CHECK (end_date >= start_date)
);

-- No máximo uma temporada ativa
CREATE UNIQUE INDEX idx_one_active_season ON public.seasons (status) WHERE status = 'ativa';

-- ─── TABELA: player_profiles ─────────────────────────────────
CREATE TABLE public.player_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  season_id     UUID NOT NULL REFERENCES public.seasons(id)  ON DELETE CASCADE,
  jersey_number SMALLINT CHECK (jersey_number BETWEEN 0 AND 99),
  position      player_position,
  height_cm     SMALLINT CHECK (height_cm BETWEEN 100 AND 260),
  age           SMALLINT CHECK (age BETWEEN 10 AND 100),
  photo_path    VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_player_season UNIQUE (user_id, season_id)
);

CREATE INDEX idx_player_profiles_season ON public.player_profiles (season_id);

-- ─── TABELA: events ──────────────────────────────────────────
CREATE TABLE public.events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      UUID         NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  type           event_type   NOT NULL,
  title          VARCHAR(160) NOT NULL,
  location       VARCHAR(200) NOT NULL,
  event_date     DATE         NOT NULL,
  event_time     TIME         NOT NULL,
  opponent       VARCHAR(160),
  training_kind  VARCHAR(80),
  description    TEXT,
  created_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_season ON public.events (season_id);
CREATE INDEX idx_events_date   ON public.events (event_date);
CREATE INDEX idx_events_type   ON public.events (type);

-- ─── TABELA: payments ────────────────────────────────────────
CREATE TABLE public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID           NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  season_id       UUID           NOT NULL REFERENCES public.seasons(id)  ON DELETE CASCADE,
  month           SMALLINT       NOT NULL CHECK (month BETWEEN 1 AND 12),
  reference_year  SMALLINT       NOT NULL,
  amount          NUMERIC(8,2)   NOT NULL CHECK (amount >= 0),
  status          payment_status NOT NULL DEFAULT 'pendente',
  paid_at         TIMESTAMPTZ,
  marked_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_month UNIQUE (user_id, season_id, month, reference_year)
);

CREATE INDEX idx_payments_user   ON public.payments (user_id);
CREATE INDEX idx_payments_season ON public.payments (season_id);
CREATE INDEX idx_payments_status ON public.payments (status);

-- ─── TABELA: chat_messages ───────────────────────────────────
CREATE TABLE public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_created_at ON public.chat_messages (created_at);

-- ─── TRIGGER: updated_at automático ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at          BEFORE UPDATE ON public.users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_seasons_updated_at        BEFORE UPDATE ON public.seasons         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_player_profiles_updated_at BEFORE UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_events_updated_at         BEFORE UPDATE ON public.events          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated_at       BEFORE UPDATE ON public.payments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS (Row Level Security) ────────────────────────────────
-- Activar RLS em todas as tabelas (obrigatório no Supabase)
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages   ENABLE ROW LEVEL SECURITY;

-- Políticas: utilizadores autenticados podem ler tudo.
-- Escrita é feita com a service role (server-side) ou por admins.
CREATE POLICY "Autenticados podem ler users"           ON public.users           FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem ler seasons"         ON public.seasons         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem ler player_profiles" ON public.player_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem ler events"          ON public.events          FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem ler payments"        ON public.payments        FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem ler chat_messages"   ON public.chat_messages   FOR SELECT TO authenticated USING (true);

-- Inserção e actualização — apenas utilizadores autenticados
CREATE POLICY "Autenticados podem escrever player_profiles" ON public.player_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem escrever events"          ON public.events          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem escrever payments"        ON public.payments        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem escrever users"           ON public.users           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem escrever seasons"         ON public.seasons         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem escrever chat"            ON public.chat_messages   FOR ALL TO authenticated USING (true) WITH CHECK (true);
