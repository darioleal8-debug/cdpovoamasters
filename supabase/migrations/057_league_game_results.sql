-- 057_league_game_results.sql
-- Resultados oficiais aprovados para TODOS os jogos de uma competição
-- (não só CD Póvoa — fonte de verdade para a classificação pública)
-- Idempotente

CREATE TABLE IF NOT EXISTS public.league_game_results (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  competition_id   UUID         REFERENCES public.competitions(id) ON DELETE SET NULL,
  home_team_name   VARCHAR(200) NOT NULL,
  away_team_name   VARCHAR(200) NOT NULL,
  home_score       INT          NOT NULL CHECK (home_score >= 0),
  away_score       INT          NOT NULL CHECK (away_score >= 0),
  jornada          INT,
  volta            INT,
  approved_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  approved_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Um único resultado oficial por evento
CREATE UNIQUE INDEX IF NOT EXISTS lgr_event_id_idx
  ON public.league_game_results(event_id);

CREATE INDEX IF NOT EXISTS lgr_competition_id_idx
  ON public.league_game_results(competition_id);

CREATE INDEX IF NOT EXISTS lgr_approved_at_idx
  ON public.league_game_results(approved_at DESC);

-- RLS: leitura pública, escrita só admin (via service role nos API routes)
ALTER TABLE public.league_game_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_game_results' AND policyname = 'p1_lgr_select_public'
  ) THEN
    CREATE POLICY "p1_lgr_select_public" ON public.league_game_results
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_game_results' AND policyname = 'p1_lgr_write_admin'
  ) THEN
    CREATE POLICY "p1_lgr_write_admin" ON public.league_game_results
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Backfill: importar resultados já existentes em game_sessions para a liga
-- (jogos do CD Póvoa com resultado já registado antes desta migration)
DO $$
DECLARE
  v_competition_id UUID;
  v_our_team_name  VARCHAR(200);
BEGIN
  SELECT id   INTO v_competition_id FROM public.competitions WHERE slug = 'liga-inatel' LIMIT 1;
  SELECT name INTO v_our_team_name  FROM public.league_teams  WHERE is_our_team = true  LIMIT 1;

  IF v_competition_id IS NULL OR v_our_team_name IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.league_game_results (
    event_id, competition_id,
    home_team_name, away_team_name,
    home_score, away_score,
    jornada, volta, approved_at
  )
  SELECT
    e.id,
    v_competition_id,
    COALESCE(
      NULLIF(e.description::json->>'home_team', ''),
      v_our_team_name
    ),
    COALESCE(
      NULLIF(e.description::json->>'away_team', ''),
      COALESCE(e.opponent, 'Adversário')
    ),
    gs.home_score,
    gs.away_score,
    CASE WHEN e.description IS NOT NULL AND e.description <> ''
         THEN NULLIF(e.description::json->>'jornada', '')::INT
         ELSE NULL END,
    CASE WHEN e.description IS NOT NULL AND e.description <> ''
         THEN NULLIF(e.description::json->>'volta',   '')::INT
         ELSE NULL END,
    COALESCE(gs.finished_at, gs.updated_at, now())
  FROM public.game_sessions gs
  JOIN public.events e ON e.id = gs.event_id
  WHERE gs.status = 'finished'
    AND e.type = 'jogo'
    AND e.competition = 'Liga'
    AND gs.home_score IS NOT NULL
    AND gs.away_score IS NOT NULL
  ON CONFLICT (event_id) DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  -- Backfill é opcional; não bloquear migration por erros de dados
  RAISE NOTICE 'league_game_results backfill skipped: %', SQLERRM;
END $$;
