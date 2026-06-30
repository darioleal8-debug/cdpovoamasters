-- =========================================================
-- MIGRAÇÃO 005: Tabela players (plantel autónomo)
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================
-- IMPORTANTE: Após correr este script, se a tabela não
-- aparecer de imediato no endpoint, vai a:
-- Settings → API → clica em "Reload schema" (ou aguarda ~30s)
-- =========================================================

-- ── 1. Criar tabela ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.players (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  UUID         NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id    UUID,
  -- team_id é uma referência suave (sem FK) para não depender
  -- da tabela league_teams ou teams que pode não existir ainda.
  name       TEXT         NOT NULL,
  number     INT          CHECK (number >= 0 AND number <= 99),
  position   TEXT         CHECK (position IN ('base', 'extremo', 'poste')),
  height     INT          CHECK (height >= 100 AND height <= 260),
  age        INT          CHECK (age >= 10 AND age <= 100),
  photo_url  TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_player_name_season UNIQUE (name, season_id)
);

-- ── 2. Índices ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_players_season ON public.players (season_id);
CREATE INDEX IF NOT EXISTS idx_players_number ON public.players (season_id, number);

-- ── 3. RLS ───────────────────────────────────────────────
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas antes de criar (idempotente)
DROP POLICY IF EXISTS "players_select" ON public.players;
DROP POLICY IF EXISTS "players_all"    ON public.players;
DROP POLICY IF EXISTS "players_insert" ON public.players;
DROP POLICY IF EXISTS "players_update" ON public.players;
DROP POLICY IF EXISTS "players_delete" ON public.players;

-- Leitura: qualquer utilizador autenticado
CREATE POLICY "players_select"
  ON public.players FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: qualquer utilizador autenticado
CREATE POLICY "players_all"
  ON public.players FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 4. Verificação ────────────────────────────────────────
-- Após correr, valida com:
-- SELECT id, name, season_id FROM public.players LIMIT 1;
-- =========================================================
