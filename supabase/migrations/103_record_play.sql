-- 103_record_play.sql
-- Soft-delete em play_by_play, idempotência por client_id,
-- contadores de timeout FIBA por metade, constraint única em game_period_scores,
-- e novos RPCs atómicos record_play + undo_play (substitui undo_last_play).

-- ─── 1. play_by_play: colunas de soft-delete + idempotência ─────────────────
ALTER TABLE public.play_by_play
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS client_id   uuid;

-- UNIQUE apenas em linhas com client_id (permite múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS play_by_play_client_id_unique
  ON public.play_by_play (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS play_by_play_deleted_at_idx
  ON public.play_by_play (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ─── 2. game_sessions: contadores FIBA de timeout por metade ────────────────
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS home_timeouts_first_half  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_timeouts_second_half smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_timeouts_first_half  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_timeouts_second_half smallint NOT NULL DEFAULT 0;

-- ─── 3. game_period_scores: constraint única (game_session_id, period) ───────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_period_scores_session_period_key'
      AND conrelid = 'public.game_period_scores'::regclass
  ) THEN
    ALTER TABLE public.game_period_scores
      ADD CONSTRAINT game_period_scores_session_period_key
      UNIQUE (game_session_id, period);
  END IF;
END $$;

-- ─── 4. recalc_period_scores: helper interno ────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_period_scores(p_game_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Upsert: para cada período, o score_after do último play não apagado
  INSERT INTO public.game_period_scores (game_session_id, period, home_score, away_score)
  SELECT
    p_game_session_id,
    period,
    home_score_after,
    away_score_after
  FROM (
    SELECT DISTINCT ON (period)
      period, home_score_after, away_score_after
    FROM public.play_by_play
    WHERE game_session_id = p_game_session_id
      AND deleted_at IS NULL
    ORDER BY period, created_at DESC
  ) latest
  ON CONFLICT ON CONSTRAINT game_period_scores_session_period_key DO UPDATE SET
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score;
END;
$$;

-- ─── 5. record_play RPC ──────────────────────────────────────────────────────
-- Regista uma jogada atomicamente: INSERT em play_by_play + UPDATE em
-- game_sessions + UPSERT em player_game_stats, com SELECT FOR UPDATE para
-- evitar race conditions. Idempotente via client_id.
CREATE OR REPLACE FUNCTION public.record_play(
  p_game_session_id     uuid,
  p_event_type          play_event_type,
  p_period              smallint,
  p_clock_time_secs     integer,
  p_is_home_team        boolean    DEFAULT true,
  p_points_delta        smallint   DEFAULT 0,
  p_player_id           uuid       DEFAULT NULL,
  p_secondary_player_id uuid       DEFAULT NULL,
  p_game_clock          varchar    DEFAULT NULL,
  p_shot_x              numeric    DEFAULT NULL,
  p_shot_y              numeric    DEFAULT NULL,
  p_shot_zone           varchar    DEFAULT NULL,
  p_description         text       DEFAULT NULL,
  p_metadata            jsonb      DEFAULT '{}',
  p_client_id           uuid       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session     RECORD;
  v_play_id     uuid;
  v_home_score  smallint;
  v_away_score  smallint;
  v_existing_id uuid;
  v_foul_types  text[] := ARRAY['foul_committed','foul_def','foul_of','foul_tec','foul_anti'];
BEGIN
  IF NOT public.is_trainer_or_above() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Idempotência: se client_id já existe devolver o play existente
  IF p_client_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.play_by_play
    WHERE client_id = p_client_id;
    IF FOUND THEN
      SELECT home_score, away_score INTO v_home_score, v_away_score
      FROM public.game_sessions WHERE id = p_game_session_id;
      RETURN jsonb_build_object(
        'play_id',    v_existing_id,
        'home_score', v_home_score,
        'away_score', v_away_score,
        'idempotent', true
      );
    END IF;
  END IF;

  -- Bloquear sessão para evitar race conditions
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_game_session_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'live' THEN RAISE EXCEPTION 'session_not_live'; END IF;

  -- Calcular novos scores
  v_home_score := v_session.home_score + CASE WHEN p_is_home_team     THEN p_points_delta ELSE 0 END;
  v_away_score := v_session.away_score + CASE WHEN NOT p_is_home_team THEN p_points_delta ELSE 0 END;

  -- Inserir play
  INSERT INTO public.play_by_play (
    game_session_id, season_id, period, game_clock, clock_time_secs,
    event_type, player_id, secondary_player_id, is_home_team, points_delta,
    home_score_after, away_score_after,
    shot_x, shot_y, shot_zone, description, metadata, client_id
  ) VALUES (
    p_game_session_id, v_session.season_id, p_period, p_game_clock, p_clock_time_secs,
    p_event_type, p_player_id, p_secondary_player_id, p_is_home_team, p_points_delta,
    v_home_score, v_away_score,
    p_shot_x, p_shot_y, p_shot_zone, p_description, COALESCE(p_metadata, '{}'), p_client_id
  ) RETURNING id INTO v_play_id;

  -- Actualizar game_sessions (scores, adversário, timeouts FIBA)
  UPDATE public.game_sessions SET
    home_score   = v_home_score,
    away_score   = v_away_score,
    away_fouls   = away_fouls + CASE
      WHEN NOT p_is_home_team AND p_event_type::text = ANY(v_foul_types) THEN 1 ELSE 0 END,
    away_reb_off = away_reb_off + CASE
      WHEN NOT p_is_home_team AND p_event_type::text = 'rebound_off' THEN 1 ELSE 0 END,
    away_reb_def = away_reb_def + CASE
      WHEN NOT p_is_home_team AND p_event_type::text = 'rebound_def' THEN 1 ELSE 0 END,
    home_timeouts_first_half  = home_timeouts_first_half  + CASE
      WHEN p_is_home_team AND p_event_type::text = 'timeout' AND p_period <= 2 THEN 1 ELSE 0 END,
    home_timeouts_second_half = home_timeouts_second_half + CASE
      WHEN p_is_home_team AND p_event_type::text = 'timeout' AND p_period > 2  THEN 1 ELSE 0 END,
    away_timeouts_first_half  = away_timeouts_first_half  + CASE
      WHEN NOT p_is_home_team AND p_event_type::text = 'timeout' AND p_period <= 2 THEN 1 ELSE 0 END,
    away_timeouts_second_half = away_timeouts_second_half + CASE
      WHEN NOT p_is_home_team AND p_event_type::text = 'timeout' AND p_period > 2  THEN 1 ELSE 0 END,
    updated_at   = now()
  WHERE id = p_game_session_id;

  -- Upsert player_game_stats (só jogadores do nosso clube com player_id)
  IF p_player_id IS NOT NULL AND p_is_home_team THEN
    INSERT INTO public.player_game_stats (
      game_session_id, season_id, player_id,
      pts, fg2_made, fg2_att, fg3_made, fg3_att,
      ft_made, ft_att, reb_off, reb_def, ast, stl, blk, tov,
      fouls_committed, fouls_drawn
    ) VALUES (
      p_game_session_id, v_session.season_id, p_player_id,
      CASE p_event_type::text WHEN '2pt_made' THEN 2 WHEN '3pt_made' THEN 3 WHEN 'ft_made' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN '2pt_made' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN '2pt_made' THEN 1 WHEN '2pt_miss' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN '3pt_made' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN '3pt_made' THEN 1 WHEN '3pt_miss' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'ft_made' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'ft_made' THEN 1 WHEN 'ft_miss'  THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'rebound_off' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'rebound_def' THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'assist'      THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'steal'       THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'block'       THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'turnover'    THEN 1 ELSE 0 END,
      CASE WHEN p_event_type::text = ANY(v_foul_types) THEN 1 ELSE 0 END,
      CASE p_event_type::text WHEN 'foul_drawn'  THEN 1 ELSE 0 END
    )
    ON CONFLICT ON CONSTRAINT uq_player_game_stats DO UPDATE SET
      pts             = player_game_stats.pts             + EXCLUDED.pts,
      fg2_made        = player_game_stats.fg2_made        + EXCLUDED.fg2_made,
      fg2_att         = player_game_stats.fg2_att         + EXCLUDED.fg2_att,
      fg3_made        = player_game_stats.fg3_made        + EXCLUDED.fg3_made,
      fg3_att         = player_game_stats.fg3_att         + EXCLUDED.fg3_att,
      ft_made         = player_game_stats.ft_made         + EXCLUDED.ft_made,
      ft_att          = player_game_stats.ft_att          + EXCLUDED.ft_att,
      reb_off         = player_game_stats.reb_off         + EXCLUDED.reb_off,
      reb_def         = player_game_stats.reb_def         + EXCLUDED.reb_def,
      ast             = player_game_stats.ast             + EXCLUDED.ast,
      stl             = player_game_stats.stl             + EXCLUDED.stl,
      blk             = player_game_stats.blk             + EXCLUDED.blk,
      tov             = player_game_stats.tov             + EXCLUDED.tov,
      fouls_committed = player_game_stats.fouls_committed + EXCLUDED.fouls_committed,
      fouls_drawn     = player_game_stats.fouls_drawn     + EXCLUDED.fouls_drawn,
      updated_at      = now();

    PERFORM public.recalc_player_efficiency(p_game_session_id, p_player_id);
  END IF;

  -- Assistência via secondary_player_id num cesto convertido
  IF p_secondary_player_id IS NOT NULL
     AND p_is_home_team
     AND p_event_type::text IN ('2pt_made', '3pt_made')
  THEN
    INSERT INTO public.player_game_stats (
      game_session_id, season_id, player_id, ast
    ) VALUES (
      p_game_session_id, v_session.season_id, p_secondary_player_id, 1
    )
    ON CONFLICT ON CONSTRAINT uq_player_game_stats DO UPDATE SET
      ast        = player_game_stats.ast + 1,
      updated_at = now();

    PERFORM public.recalc_player_efficiency(p_game_session_id, p_secondary_player_id);
  END IF;

  -- Actualizar game_period_scores para o período corrente
  INSERT INTO public.game_period_scores (game_session_id, period, home_score, away_score)
  VALUES (p_game_session_id, p_period, v_home_score, v_away_score)
  ON CONFLICT ON CONSTRAINT game_period_scores_session_period_key DO UPDATE SET
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score;

  RETURN jsonb_build_object(
    'play_id',    v_play_id,
    'home_score', v_home_score,
    'away_score', v_away_score,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_play(
  uuid, play_event_type, smallint, integer, boolean, smallint,
  uuid, uuid, varchar, numeric, numeric, varchar, text, jsonb, uuid
) TO authenticated;

-- ─── 6. undo_play RPC ────────────────────────────────────────────────────────
-- Soft-delete de uma jogada + reversão atómica do score/stats.
CREATE OR REPLACE FUNCTION public.undo_play(p_play_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_play        RECORD;
  v_session     RECORD;
  v_home_score  smallint;
  v_away_score  smallint;
  v_foul_types  text[] := ARRAY['foul_committed','foul_def','foul_of','foul_tec','foul_anti'];
BEGIN
  IF NOT public.is_trainer_or_above() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO v_play
  FROM public.play_by_play
  WHERE id = p_play_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'play_not_found'; END IF;

  IF v_play.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_deleted');
  END IF;

  -- Bloquear sessão
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = v_play.game_session_id
  FOR UPDATE;

  -- Soft-delete
  UPDATE public.play_by_play
  SET deleted_at = now(),
      deleted_by = (SELECT auth.uid())
  WHERE id = p_play_id;

  -- Calcular scores revertidos
  v_home_score := GREATEST(0,
    v_session.home_score - CASE WHEN v_play.is_home_team     THEN v_play.points_delta ELSE 0 END);
  v_away_score := GREATEST(0,
    v_session.away_score - CASE WHEN NOT v_play.is_home_team THEN v_play.points_delta ELSE 0 END);

  -- Actualizar game_sessions
  UPDATE public.game_sessions SET
    home_score   = v_home_score,
    away_score   = v_away_score,
    away_fouls   = GREATEST(0, away_fouls - CASE
      WHEN NOT v_play.is_home_team AND v_play.event_type::text = ANY(v_foul_types) THEN 1 ELSE 0 END),
    away_reb_off = GREATEST(0, away_reb_off - CASE
      WHEN NOT v_play.is_home_team AND v_play.event_type::text = 'rebound_off' THEN 1 ELSE 0 END),
    away_reb_def = GREATEST(0, away_reb_def - CASE
      WHEN NOT v_play.is_home_team AND v_play.event_type::text = 'rebound_def' THEN 1 ELSE 0 END),
    home_timeouts_first_half  = GREATEST(0, home_timeouts_first_half  - CASE
      WHEN v_play.is_home_team AND v_play.event_type::text = 'timeout' AND v_play.period <= 2 THEN 1 ELSE 0 END),
    home_timeouts_second_half = GREATEST(0, home_timeouts_second_half - CASE
      WHEN v_play.is_home_team AND v_play.event_type::text = 'timeout' AND v_play.period > 2  THEN 1 ELSE 0 END),
    away_timeouts_first_half  = GREATEST(0, away_timeouts_first_half  - CASE
      WHEN NOT v_play.is_home_team AND v_play.event_type::text = 'timeout' AND v_play.period <= 2 THEN 1 ELSE 0 END),
    away_timeouts_second_half = GREATEST(0, away_timeouts_second_half - CASE
      WHEN NOT v_play.is_home_team AND v_play.event_type::text = 'timeout' AND v_play.period > 2  THEN 1 ELSE 0 END),
    updated_at   = now()
  WHERE id = v_play.game_session_id;

  -- Reverter player_game_stats (só jogadores nossos)
  IF v_play.player_id IS NOT NULL AND v_play.is_home_team THEN
    UPDATE public.player_game_stats SET
      pts             = GREATEST(0, pts             - CASE v_play.event_type::text WHEN '2pt_made' THEN 2 WHEN '3pt_made' THEN 3 WHEN 'ft_made' THEN 1 ELSE 0 END),
      fg2_made        = GREATEST(0, fg2_made        - CASE v_play.event_type::text WHEN '2pt_made' THEN 1 ELSE 0 END),
      fg2_att         = GREATEST(0, fg2_att         - CASE v_play.event_type::text WHEN '2pt_made' THEN 1 WHEN '2pt_miss' THEN 1 ELSE 0 END),
      fg3_made        = GREATEST(0, fg3_made        - CASE v_play.event_type::text WHEN '3pt_made' THEN 1 ELSE 0 END),
      fg3_att         = GREATEST(0, fg3_att         - CASE v_play.event_type::text WHEN '3pt_made' THEN 1 WHEN '3pt_miss' THEN 1 ELSE 0 END),
      ft_made         = GREATEST(0, ft_made         - CASE v_play.event_type::text WHEN 'ft_made'  THEN 1 ELSE 0 END),
      ft_att          = GREATEST(0, ft_att          - CASE v_play.event_type::text WHEN 'ft_made'  THEN 1 WHEN 'ft_miss' THEN 1 ELSE 0 END),
      reb_off         = GREATEST(0, reb_off         - CASE v_play.event_type::text WHEN 'rebound_off' THEN 1 ELSE 0 END),
      reb_def         = GREATEST(0, reb_def         - CASE v_play.event_type::text WHEN 'rebound_def' THEN 1 ELSE 0 END),
      ast             = GREATEST(0, ast             - CASE v_play.event_type::text WHEN 'assist'   THEN 1 ELSE 0 END),
      stl             = GREATEST(0, stl             - CASE v_play.event_type::text WHEN 'steal'    THEN 1 ELSE 0 END),
      blk             = GREATEST(0, blk             - CASE v_play.event_type::text WHEN 'block'    THEN 1 ELSE 0 END),
      tov             = GREATEST(0, tov             - CASE v_play.event_type::text WHEN 'turnover' THEN 1 ELSE 0 END),
      fouls_committed = GREATEST(0, fouls_committed - CASE WHEN v_play.event_type::text = ANY(v_foul_types) THEN 1 ELSE 0 END),
      fouls_drawn     = GREATEST(0, fouls_drawn     - CASE v_play.event_type::text WHEN 'foul_drawn' THEN 1 ELSE 0 END),
      updated_at      = now()
    WHERE game_session_id = v_play.game_session_id
      AND player_id = v_play.player_id;

    PERFORM public.recalc_player_efficiency(v_play.game_session_id, v_play.player_id);
  END IF;

  -- Reverter assistência do secondary_player
  IF v_play.secondary_player_id IS NOT NULL
     AND v_play.is_home_team
     AND v_play.event_type::text IN ('2pt_made', '3pt_made')
  THEN
    UPDATE public.player_game_stats SET
      ast        = GREATEST(0, ast - 1),
      updated_at = now()
    WHERE game_session_id = v_play.game_session_id
      AND player_id = v_play.secondary_player_id;

    PERFORM public.recalc_player_efficiency(v_play.game_session_id, v_play.secondary_player_id);
  END IF;

  -- Recalcular period scores a partir dos plays não apagados
  PERFORM public.recalc_period_scores(v_play.game_session_id);

  RETURN jsonb_build_object(
    'ok',         true,
    'play_id',    p_play_id,
    'home_score', v_home_score,
    'away_score', v_away_score
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_play(uuid) TO authenticated;

-- ─── 7. Remover undo_last_play (substituído por undo_play) ───────────────────
DROP FUNCTION IF EXISTS public.undo_last_play(uuid);
