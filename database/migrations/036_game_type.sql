-- Migration 036: game_type column on events
--
-- Distinguishes official competition games from friendly/training games.
-- 'official'  → conta para estatísticas oficiais (liga, taça, …)
-- 'friendly'  → jogo de treino/amigável — NÃO conta para classificação
--
-- Todos os jogos existentes ficam com 'official' (valor por defeito).
-- A restrição CHECK garante que apenas estes dois valores são aceites.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'official'
  CHECK (game_type IN ('official', 'friendly'));

-- Índice para filtragem eficiente
CREATE INDEX IF NOT EXISTS idx_events_game_type
  ON public.events (game_type);

-- Índice combinado season + type + game_type (queries mais comuns)
CREATE INDEX IF NOT EXISTS idx_events_season_type_gametype
  ON public.events (season_id, type, game_type);

COMMENT ON COLUMN public.events.game_type IS
  'official = jogo oficial (conta para classificação e stats oficiais); friendly = jogo de treino/amigável (não conta para classificação)';
