-- 136_live_audit_fixes.sql
-- Live stats audit fixes:
--   1. play_by_play trigger: a 3PT must be outside the 3-point line and a 2PT inside it (FIBA court).
--   2. substitute_player: atomic substitution (lineup + play + stints in one transaction).
--   3. live_start_clock / live_stop_clock: the clock timestamps come from the database clock,
--      so scorer and spectator devices with a wrong time stay in sync.
-- The app falls back to the previous behaviour when 2 or 3 are not installed yet.

-- ─── 1. Shot spot vs shot type ───────────────────────────────────────────────
-- Court model (same as web/lib/live/shot-zones.ts): half court 15 m x 14 m, shot_x / shot_y in %,
-- basket 1.575 m from the baseline, 3PT arc radius 6.75 m, corner lines 6.6 m from the centre.
-- The line itself counts as a 2PT.
CREATE OR REPLACE FUNCTION public.validate_shot_spot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ev    text := NEW.event_type::text;
  v_mx    numeric;
  v_my    numeric;
  v_three boolean;
BEGIN
  IF v_ev IN ('2pt_made', '2pt_miss', '3pt_made', '3pt_miss')
     AND NEW.shot_x IS NOT NULL AND NEW.shot_y IS NOT NULL THEN
    v_mx := (NEW.shot_x / 100.0) * 15 - 7.5;
    v_my := (NEW.shot_y / 100.0) * 14 - 1.575;
    v_three := sqrt(v_mx * v_mx + v_my * v_my) > 6.75 OR abs(v_mx) > 6.6;
    IF v_three <> (v_ev LIKE '3pt%') THEN
      RAISE EXCEPTION 'shot_spot_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS play_by_play_validate_shot_spot ON public.play_by_play;
CREATE TRIGGER play_by_play_validate_shot_spot
  BEFORE INSERT ON public.play_by_play
  FOR EACH ROW EXECUTE FUNCTION public.validate_shot_spot();

-- ─── 2. Atomic substitution ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.substitute_player(
  p_game_session_id uuid,
  p_in              uuid,
  p_out             uuid,
  p_period          smallint,
  p_clock_time_secs integer,
  p_game_clock      varchar DEFAULT NULL,
  p_description     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session record;
  v_lineup  uuid[];
  v_new     uuid[];
BEGIN
  IF NOT public.is_trainer_or_above() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_game_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'live' THEN RAISE EXCEPTION 'session_not_live'; END IF;

  SELECT on_court_ids INTO v_lineup
  FROM public.game_current_lineup WHERE game_session_id = p_game_session_id FOR UPDATE;
  v_lineup := COALESCE(v_lineup, '{}');

  IF NOT (p_out = ANY(v_lineup)) THEN RAISE EXCEPTION 'player_out_not_on_court'; END IF;
  IF p_in = ANY(v_lineup) THEN RAISE EXCEPTION 'player_in_already_on_court'; END IF;

  v_new := array_append(array_remove(v_lineup, p_out), p_in);

  INSERT INTO public.game_current_lineup (game_session_id, on_court_ids, updated_at)
  VALUES (p_game_session_id, v_new, now())
  ON CONFLICT (game_session_id) DO UPDATE
    SET on_court_ids = EXCLUDED.on_court_ids, updated_at = EXCLUDED.updated_at;

  INSERT INTO public.play_by_play (
    game_session_id, season_id, period, game_clock, clock_time_secs, event_type,
    player_id, secondary_player_id, is_home_team, points_delta,
    home_score_after, away_score_after, description
  ) VALUES (
    p_game_session_id, v_session.season_id, p_period, p_game_clock, p_clock_time_secs, 'substitution_in',
    p_in, p_out, true, 0,
    v_session.home_score, v_session.away_score, p_description
  );

  UPDATE public.player_court_stints
  SET exit_clock_secs = p_clock_time_secs,
      exit_home_score = v_session.home_score,
      exit_away_score = v_session.away_score
  WHERE game_session_id = p_game_session_id AND player_id = p_out AND exit_clock_secs IS NULL;

  INSERT INTO public.player_court_stints (
    game_session_id, player_id, period, entry_clock_secs, entry_home_score, entry_away_score
  ) VALUES (
    p_game_session_id, p_in, p_period, p_clock_time_secs, v_session.home_score, v_session.away_score
  );

  RETURN jsonb_build_object('on_court_ids', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.substitute_player(uuid, uuid, uuid, smallint, integer, varchar, text) TO authenticated;

-- ─── 3. Clock on the database clock ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.live_start_clock(p_session_id uuid)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v public.game_sessions;
BEGIN
  IF NOT public.is_trainer_or_above() THEN RAISE EXCEPTION 'permission_denied'; END IF;
  UPDATE public.game_sessions
  SET clock_running = true, clock_started_at = now(), updated_at = now()
  WHERE id = p_session_id AND status = 'live' AND clock_running = false
  RETURNING * INTO v;
  IF NOT FOUND THEN SELECT * INTO v FROM public.game_sessions WHERE id = p_session_id; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_stop_clock(p_session_id uuid)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v public.game_sessions;
BEGIN
  IF NOT public.is_trainer_or_above() THEN RAISE EXCEPTION 'permission_denied'; END IF;
  UPDATE public.game_sessions
  SET clock_elapsed_secs = LEAST(
        COALESCE(period_duration_secs, 480),
        round(COALESCE(clock_elapsed_secs, 0) + extract(epoch FROM (now() - COALESCE(clock_started_at, now())))::numeric)
      ),
      clock_running = false, clock_started_at = null, updated_at = now()
  WHERE id = p_session_id AND status = 'live' AND clock_running = true
  RETURNING * INTO v;
  IF NOT FOUND THEN SELECT * INTO v FROM public.game_sessions WHERE id = p_session_id; END IF;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_start_clock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.live_stop_clock(uuid) TO authenticated;
