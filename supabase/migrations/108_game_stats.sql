-- 108_game_stats.sql
-- Fase 2: tabelas normalizadas de estatísticas de jogo

-- 1. Novas colunas em league_game_results
ALTER TABLE public.league_game_results
  ADD COLUMN IF NOT EXISTS referees             text[],
  ADD COLUMN IF NOT EXISTS overtime             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_submission_id uuid
    REFERENCES public.result_submissions(id);

-- 2. Parciais por período
CREATE TABLE IF NOT EXISTS public.league_game_periods (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid     NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  periodo      smallint NOT NULL CHECK (periodo >= 1),
  home_points  smallint NOT NULL CHECK (home_points >= 0),
  away_points  smallint NOT NULL CHECK (away_points >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, periodo)
);

-- 3. Estatísticas por jogador
CREATE TABLE IF NOT EXISTS public.league_game_player_stats (
  id            uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid     NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id       uuid     REFERENCES public.league_teams(id),
  side          text     NOT NULL CHECK (side IN ('home', 'away')),
  numero        smallint,
  nome          text     NOT NULL,
  pontos        smallint NOT NULL DEFAULT 0,
  triplos       smallint NOT NULL DEFAULT 0,
  lances_livres smallint NOT NULL DEFAULT 0,
  faltas        smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_lgp_event_id  ON public.league_game_periods (event_id);
CREATE INDEX IF NOT EXISTS idx_lgps_event_id ON public.league_game_player_stats (event_id);

-- 5. RLS
ALTER TABLE public.league_game_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_game_player_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'league_game_periods'
      AND policyname = 'lgp_select_public') THEN
    EXECUTE 'CREATE POLICY lgp_select_public
      ON public.league_game_periods FOR SELECT
      TO anon, authenticated USING (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'league_game_player_stats'
      AND policyname = 'lgps_select_public') THEN
    EXECUTE 'CREATE POLICY lgps_select_public
      ON public.league_game_player_stats FOR SELECT
      TO anon, authenticated USING (true)';
  END IF;
END $$;

-- 6. GRANTs de leitura pública
GRANT SELECT ON public.league_game_periods      TO anon, authenticated;
GRANT SELECT ON public.league_game_player_stats TO anon, authenticated;
