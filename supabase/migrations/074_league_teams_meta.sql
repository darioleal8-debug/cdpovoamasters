-- 074_league_teams_meta.sql
-- Adiciona slug, logo_url, short_name e sigla à tabela league_teams
-- Idempotente

ALTER TABLE public.league_teams
  ADD COLUMN IF NOT EXISTS slug        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS logo_url    TEXT,
  ADD COLUMN IF NOT EXISTS short_name  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sigla       VARCHAR(10);

-- Popula slug a partir de normalized_name (somente onde estiver null)
UPDATE public.league_teams
SET slug = REGEXP_REPLACE(
  REGEXP_REPLACE(
    LOWER(TRIM(normalized_name)),
    '[^a-z0-9\s]', '', 'g'
  ),
  '\s+', '-', 'g'
)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS league_teams_slug_idx
  ON public.league_teams(slug)
  WHERE slug IS NOT NULL;
