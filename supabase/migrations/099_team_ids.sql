-- 099_team_ids.sql
-- Adiciona home_team_id / away_team_id a league_game_results e result_submissions.
-- Cria resolve_team_id() para resolução de variantes de nome (team_aliases já existia).
-- Nota: unaccent não disponível; usa translate() para diacríticos portugueses.

-- ─── resolve_team_id ──────────────────────────────────────────────────────────
-- Normaliza via lower + translate (acentos → base) + regexp.
-- Procura em league_teams.normalized_name; fallback em team_aliases.alias.
CREATE OR REPLACE FUNCTION public.resolve_team_id(p_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH norm AS (
    SELECT trim(regexp_replace(
             regexp_replace(
               translate(
                 lower(p_name),
                 'àáâãäåçèéêëìíîïðñòóôõöùúûüýÿ',
                 'aaaaaaceeeeiiiidnoooooouuuuyy'
               ),
               '[^a-z0-9 ]', '', 'g'
             ),
             ' +', ' ', 'g')) AS n
  )
  SELECT lt.id
  FROM   public.league_teams lt, norm
  WHERE  lt.normalized_name = norm.n
    AND  lt.is_placeholder = false
  UNION ALL
  SELECT ta.team_id
  FROM   public.team_aliases ta, norm
  WHERE  ta.alias = norm.n
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

-- ─── Backfill ─────────────────────────────────────────────────────────────────
UPDATE public.league_game_results
SET home_team_id = public.resolve_team_id(home_team_name)
WHERE home_team_id IS NULL;

UPDATE public.league_game_results
SET away_team_id = public.resolve_team_id(away_team_name)
WHERE away_team_id IS NULL;

UPDATE public.result_submissions
SET home_team_id = public.resolve_team_id(home_team_name)
WHERE home_team_id IS NULL;

UPDATE public.result_submissions
SET away_team_id = public.resolve_team_id(away_team_name)
WHERE away_team_id IS NULL;
