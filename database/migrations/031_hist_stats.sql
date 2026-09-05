-- 031_hist_stats.sql
-- Módulo "Histórico de Estatísticas": temporadas, jogadores, jogos e stats históricas
-- Completamente independente das tabelas da temporada corrente (seasons, players, game_sessions, player_game_stats)

-- ── Temporadas históricas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hist_seasons (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text        NOT NULL,           -- "2018/2019"
  start_year smallint    NOT NULL,
  end_year   smallint    NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(label)
);

ALTER TABLE public.hist_seasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "hist_seasons_read"   ON public.hist_seasons FOR SELECT USING (true);
  CREATE POLICY "hist_seasons_write"  ON public.hist_seasons FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','treinador')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Jogadores históricos (identidade cross-season) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.hist_players (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  canonical_name    text        NOT NULL,   -- normalizado: sem acentos, lowercase
  current_player_id uuid        REFERENCES public.players(id) ON DELETE SET NULL,
  is_imported       bool        NOT NULL DEFAULT true,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hist_players ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "hist_players_read"  ON public.hist_players FOR SELECT USING (true);
  CREATE POLICY "hist_players_write" ON public.hist_players FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','treinador')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Jogos históricos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hist_games (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hist_season_id uuid        NOT NULL REFERENCES public.hist_seasons(id) ON DELETE CASCADE,
  game_date      date,
  opponent_name  text,
  home_score     int,
  away_score     int,
  competition    text,
  venue          text,
  pdf_filename   text,
  notes          text,
  imported_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hist_games ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "hist_games_read"  ON public.hist_games FOR SELECT USING (true);
  CREATE POLICY "hist_games_write" ON public.hist_games FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','treinador')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS hist_games_season_idx ON public.hist_games(hist_season_id);
CREATE INDEX IF NOT EXISTS hist_games_date_idx   ON public.hist_games(game_date);

-- ── Estatísticas históricas por jogador por jogo ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.hist_player_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hist_game_id    uuid        NOT NULL REFERENCES public.hist_games(id)   ON DELETE CASCADE,
  hist_player_id  uuid        NOT NULL REFERENCES public.hist_players(id) ON DELETE CASCADE,
  hist_season_id  uuid        NOT NULL REFERENCES public.hist_seasons(id) ON DELETE CASCADE,
  jersey_number   int,
  seconds_played  int         NOT NULL DEFAULT 0,
  fg2_made        int         NOT NULL DEFAULT 0,
  fg2_att         int         NOT NULL DEFAULT 0,
  fg3_made        int         NOT NULL DEFAULT 0,
  fg3_att         int         NOT NULL DEFAULT 0,
  ft_made         int         NOT NULL DEFAULT 0,
  ft_att          int         NOT NULL DEFAULT 0,
  reb_off         int         NOT NULL DEFAULT 0,
  reb_def         int         NOT NULL DEFAULT 0,
  ast             int         NOT NULL DEFAULT 0,
  stl             int         NOT NULL DEFAULT 0,
  blk             int         NOT NULL DEFAULT 0,
  tov             int         NOT NULL DEFAULT 0,
  fouls_committed int         NOT NULL DEFAULT 0,
  fouls_drawn     int         NOT NULL DEFAULT 0,
  pts             int         NOT NULL DEFAULT 0,
  plus_minus      int         NOT NULL DEFAULT 0,
  efficiency      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hist_game_id, hist_player_id)
);

ALTER TABLE public.hist_player_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "hist_player_stats_read"  ON public.hist_player_stats FOR SELECT USING (true);
  CREATE POLICY "hist_player_stats_write" ON public.hist_player_stats FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','treinador')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS hist_ps_game_idx   ON public.hist_player_stats(hist_game_id);
CREATE INDEX IF NOT EXISTS hist_ps_player_idx ON public.hist_player_stats(hist_player_id);
CREATE INDEX IF NOT EXISTS hist_ps_season_idx ON public.hist_player_stats(hist_season_id);
