-- 099_team_ids.sql
-- Adiciona home_team_id / away_team_id a league_game_results e result_submissions.
-- Cria team_aliases para resolução de nomes alternativos.
-- Faz backfill de todas as linhas existentes.

-- ─── team_aliases ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_aliases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
  alias      text NOT NULL,
  normalized text NOT NULL,
  UNIQUE (normalized)
);

CREATE INDEX IF NOT EXISTS team_aliases_team_id_idx  ON public.team_aliases (team_id);
CREATE INDEX IF NOT EXISTS team_aliases_normalized_idx ON public.team_aliases (normalized);

-- ─── resolve_team_id ──────────────────────────────────────────────────────────
-- Normaliza o nome (unaccent + lowercase + só alfanumérico + espaços simples)
-- e procura primeiro em league_teams.normalized_name, depois em team_aliases.normalized.
CREATE OR REPLACE FUNCTION public.resolve_team_id(p_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = extensions, public AS $$
  WITH norm AS (
    SELECT trim(regexp_replace(
             regexp_replace(lower(unaccent(p_name)), '[^a-z0-9 ]', '', 'g'),
             ' +', ' ', 'g')) AS n
  )
  SELECT lt.id
  FROM   public.league_teams lt, norm
  WHERE  lt.normalized_name = norm.n
    AND  lt.is_placeholder = false
  UNION ALL
  SELECT ta.team_id
  FROM   public.team_aliases ta, norm
  WHERE  ta.normalized = norm.n
  LIMIT  1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_team_id(text) TO authenticated, service_role;

-- ─── league_game_results: colunas team_id ────────────────────────────────────
ALTER TABLE public.league_game_results
  ADD COLUMN IF NOT EXISTS home_team_id uuid REFERENCES public.league_teams(id),
  ADD COLUMN IF NOT EXISTS away_team_id uuid REFERENCES public.league_teams(id);

CREATE INDEX IF NOT EXISTS lgr_home_team_id_idx ON public.league_game_results (home_team_id);
CREATE INDEX IF NOT EXISTS lgr_away_team_id_idx ON public.league_game_results (away_team_id);

-- ─── result_submissions: colunas team_id ─────────────────────────────────────
ALTER TABLE public.result_submissions
  ADD COLUMN IF NOT EXISTS home_team_id uuid REFERENCES public.league_teams(id),
  ADD COLUMN IF NOT EXISTS away_team_id uuid REFERENCES public.league_teams(id);

-- ─── Backfill league_game_results ─────────────────────────────────────────────
UPDATE public.league_game_results
SET home_team_id = public.resolve_team_id(home_team_name)
WHERE home_team_id IS NULL;

UPDATE public.league_game_results
SET away_team_id = public.resolve_team_id(away_team_name)
WHERE away_team_id IS NULL;

-- ─── Backfill result_submissions ──────────────────────────────────────────────
UPDATE public.result_submissions
SET home_team_id = public.resolve_team_id(home_team_name)
WHERE home_team_id IS NULL;

UPDATE public.result_submissions
SET away_team_id = public.resolve_team_id(away_team_name)
WHERE away_team_id IS NULL;
