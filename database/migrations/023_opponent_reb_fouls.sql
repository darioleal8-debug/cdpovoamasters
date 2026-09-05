-- =========================================================
-- MIGRAÇÃO 023: Ressaltos e faltas do adversário em game_sessions
-- =========================================================
-- Aplicar em: Supabase Dashboard > SQL Editor > New Query
-- =========================================================

ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS away_reb_off  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_reb_def  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_fouls    SMALLINT NOT NULL DEFAULT 0;
