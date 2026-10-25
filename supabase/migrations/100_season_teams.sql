-- 100_season_teams.sql
-- Tabela de inscrição de equipas por competição/temporada.
-- Permite ativar/desativar equipas sem apagar dados históricos.
-- Uma equipa inativa não aparece na classificação nem nos filtros dessa temporada.

CREATE TABLE IF NOT EXISTS public.season_teams (
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id        uuid NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, team_id)
);

CREATE INDEX IF NOT EXISTS season_teams_comp_active_idx
  ON public.season_teams (competition_id, active);

-- ─── RLS: leitura pública; escrita via service_role ───────────────────────────
ALTER TABLE public.season_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_teams_read" ON public.season_teams;
CREATE POLICY "season_teams_read" ON public.season_teams
  FOR SELECT USING (true);

GRANT SELECT ON public.season_teams TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_teams TO service_role;

-- ─── Seed para Liga INATEL temporada atual ────────────────────────────────────
-- Todas as equipas não-placeholder inscrevem-se; Clube PT Norte começa inativa.
INSERT INTO public.season_teams (competition_id, team_id, active)
SELECT
  c.id,
  lt.id,
  CASE WHEN lt.id = '882fc28c-4571-4cc3-ab87-aa9d76cd927c' THEN false ELSE true END
FROM public.competitions c
CROSS JOIN public.league_teams lt
WHERE c.slug = 'liga-inatel'
  AND lt.is_placeholder = false
ON CONFLICT (competition_id, team_id) DO NOTHING;
