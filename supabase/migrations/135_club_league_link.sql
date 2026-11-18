-- Liga de cada clube para o link "Site da Liga" da app de gestão.
-- Regra: league_url preenchido → link externo para essa liga (league_name é o nome a mostrar);
-- senão, se o clube tem league_team_id → Liga INATEL (/liga-inatel); senão → sem link.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS league_name text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS league_url  text;
ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_league_url_http;
ALTER TABLE public.clubs ADD CONSTRAINT clubs_league_url_http
  CHECK (league_url IS NULL OR league_url ~* '^https?://');
