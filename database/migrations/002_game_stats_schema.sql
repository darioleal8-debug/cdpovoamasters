-- =========================================================
-- MIGRAÇÃO 002: Módulo de Estatísticas de Jogo
-- Aplicar em: Supabase Dashboard > SQL Editor > New Query
-- =========================================================

-- ─── TIPOS ENUMERADOS ────────────────────────────────────────
CREATE TYPE game_status AS ENUM ('scheduled', 'live', 'finished');
CREATE TYPE play_event_type AS ENUM (
  '2pt_made', '2pt_miss',
  '3pt_made', '3pt_miss',
  'ft_made', 'ft_miss',
  'rebound_off', 'rebound_def',
  'assist',
  'steal',
  'block',
  'turnover',
  'foul_committed', 'foul_drawn',
  'substitution_in', 'substitution_out',
  'timeout',
  'period_start', 'period_end',
  'game_start', 'game_end'
);

-- ─── game_sessions ────────────────────────────────────────────
-- Uma sessão de jogo por evento. Liga event_id à estatística live.
CREATE TABLE public.game_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  season_id        UUID NOT NULL REFERENCES public.seasons(id),
  status           game_status NOT NULL DEFAULT 'scheduled',
  current_period   SMALLINT NOT NULL DEFAULT 1 CHECK (current_period BETWEEN 1 AND 10),
  home_score       SMALLINT NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score       SMALLINT NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  opponent_name    VARCHAR(160) NOT NULL DEFAULT 'Adversário',
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_session UNIQUE (event_id)
);

CREATE INDEX idx_game_sessions_season  ON public.game_sessions (season_id);
CREATE INDEX idx_game_sessions_status  ON public.game_sessions (status);

-- ─── play_by_play ─────────────────────────────────────────────
-- Registo de cada evento durante o jogo, pela ordem em que ocorreu.
CREATE TABLE public.play_by_play (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id      UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  season_id            UUID NOT NULL REFERENCES public.seasons(id),
  period               SMALLINT NOT NULL CHECK (period BETWEEN 1 AND 10),
  game_clock           VARCHAR(10) DEFAULT '00:00',  -- ex: "08:45"
  event_type           play_event_type NOT NULL,
  player_id            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  secondary_player_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_home_team         BOOLEAN NOT NULL DEFAULT true,
  points_delta         SMALLINT NOT NULL DEFAULT 0,
  home_score_after     SMALLINT NOT NULL DEFAULT 0,
  away_score_after     SMALLINT NOT NULL DEFAULT 0,
  shot_x               NUMERIC(5,2),  -- % largura do campo (0-100)
  shot_y               NUMERIC(5,2),  -- % comprimento do campo (0-100)
  shot_zone            VARCHAR(40),   -- 'paint', 'mid_range', '3pt_left', etc.
  description          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pbp_session  ON public.play_by_play (game_session_id);
CREATE INDEX idx_pbp_player   ON public.play_by_play (player_id);
CREATE INDEX idx_pbp_period   ON public.play_by_play (game_session_id, period);

-- ─── player_game_stats ────────────────────────────────────────
-- Estatísticas agregadas por jogador por jogo.
-- Atualizadas automaticamente após cada evento.
CREATE TABLE public.player_game_stats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id  UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  season_id        UUID NOT NULL REFERENCES public.seasons(id),
  player_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Tempo em campo
  minutes_played   NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Pontuação
  pts              SMALLINT NOT NULL DEFAULT 0,
  fg2_made         SMALLINT NOT NULL DEFAULT 0,
  fg2_att          SMALLINT NOT NULL DEFAULT 0,
  fg3_made         SMALLINT NOT NULL DEFAULT 0,
  fg3_att          SMALLINT NOT NULL DEFAULT 0,
  ft_made          SMALLINT NOT NULL DEFAULT 0,
  ft_att           SMALLINT NOT NULL DEFAULT 0,
  -- Ressaltos
  reb_off          SMALLINT NOT NULL DEFAULT 0,
  reb_def          SMALLINT NOT NULL DEFAULT 0,
  -- Outros
  ast              SMALLINT NOT NULL DEFAULT 0,
  stl              SMALLINT NOT NULL DEFAULT 0,
  blk              SMALLINT NOT NULL DEFAULT 0,
  tov              SMALLINT NOT NULL DEFAULT 0,
  fouls_committed  SMALLINT NOT NULL DEFAULT 0,
  fouls_drawn      SMALLINT NOT NULL DEFAULT 0,
  plus_minus       SMALLINT NOT NULL DEFAULT 0,
  -- Calculados automaticamente
  efficiency       NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_player_game_stats UNIQUE (game_session_id, player_id)
);

CREATE INDEX idx_pgs_session ON public.player_game_stats (game_session_id);
CREATE INDEX idx_pgs_player  ON public.player_game_stats (player_id);

-- ─── game_period_scores ───────────────────────────────────────
-- Pontuação por período (para box score detalhado).
CREATE TABLE public.game_period_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id  UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  period           SMALLINT NOT NULL CHECK (period BETWEEN 1 AND 10),
  home_score       SMALLINT NOT NULL DEFAULT 0,
  away_score       SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_game_period UNIQUE (game_session_id, period)
);

-- ─── game_substitutions ───────────────────────────────────────
-- Histórico de substituições para cálculo de minutos jogados.
CREATE TABLE public.game_substitutions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id  UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  period           SMALLINT NOT NULL,
  game_clock       VARCHAR(10),
  player_out_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  player_in_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subs_session ON public.game_substitutions (game_session_id);

-- ─── TRIGGER: updated_at ──────────────────────────────────────
CREATE TRIGGER trg_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_player_game_stats_updated_at
  BEFORE UPDATE ON public.player_game_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.game_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_by_play        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_period_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_substitutions  ENABLE ROW LEVEL SECURITY;

-- Leitura para todos os autenticados
CREATE POLICY "Ler game_sessions"      ON public.game_sessions      FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ler play_by_play"       ON public.play_by_play       FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ler player_game_stats"  ON public.player_game_stats  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ler period_scores"      ON public.game_period_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ler substitutions"      ON public.game_substitutions FOR SELECT TO authenticated USING (true);

-- Escrita apenas para autenticados (treinador/admin validado no frontend)
CREATE POLICY "Escrever game_sessions"      ON public.game_sessions      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrever play_by_play"       ON public.play_by_play       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrever player_game_stats"  ON public.player_game_stats  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrever period_scores"      ON public.game_period_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrever substitutions"      ON public.game_substitutions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── RPC: recalcular eficiência ───────────────────────────────
-- Eficiência = PTS + REB_TOT + AST + STL + BLK - TOV - (FGA - FGM) - (FTA - FTM)
CREATE OR REPLACE FUNCTION public.recalc_player_efficiency(p_game_session_id UUID, p_player_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.player_game_stats SET
    efficiency = pts
      + (reb_off + reb_def)
      + ast + stl + blk
      - tov
      - ((fg2_att - fg2_made) + (fg3_att - fg3_made))
      - (ft_att - ft_made),
    updated_at = now()
  WHERE game_session_id = p_game_session_id
    AND player_id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_player_efficiency(UUID, UUID) TO authenticated;
