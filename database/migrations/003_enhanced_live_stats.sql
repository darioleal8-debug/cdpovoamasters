-- =========================================================
-- MIGRAÇÃO 003: Módulo Live Aprimorado
-- Aplicar em: Supabase Dashboard > SQL Editor > New Query
-- =========================================================

-- ─── 1. Controlo de relógio em game_sessions ─────────────
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS clock_running       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clock_elapsed_secs  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_duration_secs INTEGER    NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS home_timeouts_left  SMALLINT    NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS away_timeouts_left  SMALLINT    NOT NULL DEFAULT 4;

-- ─── 2. Metadados e relógio em play_by_play ──────────────
ALTER TABLE public.play_by_play
  ADD COLUMN IF NOT EXISTS clock_time_secs INTEGER,
  ADD COLUMN IF NOT EXISTS metadata        JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 3. Campos adicionais em player_game_stats ───────────
-- fouls_drawn e plus_minus já existem na 002; seconds_played é novo
ALTER TABLE public.player_game_stats
  ADD COLUMN IF NOT EXISTS seconds_played INTEGER NOT NULL DEFAULT 0;

-- ─── 4. Alinhamento atual (on court vs banco) ─────────────
CREATE TABLE IF NOT EXISTS public.game_current_lineup (
  game_session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  on_court_ids    UUID[]      NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_current_lineup ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'game_current_lineup' AND policyname = 'lineup_auth_all') THEN
    CREATE POLICY "lineup_auth_all" ON public.game_current_lineup
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'game_current_lineup' AND policyname = 'lineup_anon_read') THEN
    CREATE POLICY "lineup_anon_read" ON public.game_current_lineup
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ─── 5. Stints de jogadores (tempo em campo + +/-) ────────
CREATE TABLE IF NOT EXISTS public.player_court_stints (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id   UUID        NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_id         UUID        NOT NULL REFERENCES public.users(id),
  period            SMALLINT    NOT NULL DEFAULT 1,
  entry_clock_secs  INTEGER     NOT NULL DEFAULT 600,
  exit_clock_secs   INTEGER,
  entry_home_score  SMALLINT    NOT NULL DEFAULT 0,
  entry_away_score  SMALLINT    NOT NULL DEFAULT 0,
  exit_home_score   SMALLINT,
  exit_away_score   SMALLINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stints_session ON public.player_court_stints (game_session_id);
CREATE INDEX IF NOT EXISTS idx_stints_player  ON public.player_court_stints (player_id);

ALTER TABLE public.player_court_stints ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'player_court_stints' AND policyname = 'stints_auth_all') THEN
    CREATE POLICY "stints_auth_all" ON public.player_court_stints
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'player_court_stints' AND policyname = 'stints_anon_read') THEN
    CREATE POLICY "stints_anon_read" ON public.player_court_stints
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ─── 6. Anon pode ler os dados de live ───────────────────
-- Necessário para a vista pública /live/[id]
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'game_sessions' AND policyname = 'Ler game_sessions anon') THEN
    CREATE POLICY "Ler game_sessions anon" ON public.game_sessions
      FOR SELECT TO anon USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'play_by_play' AND policyname = 'Ler play_by_play anon') THEN
    CREATE POLICY "Ler play_by_play anon" ON public.play_by_play
      FOR SELECT TO anon USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'player_game_stats' AND policyname = 'Ler player_game_stats anon') THEN
    CREATE POLICY "Ler player_game_stats anon" ON public.player_game_stats
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ─── 7. Realtime para vistas live ─────────────────────────
-- Ignorar erros se já estiver adicionado
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.play_by_play;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_game_stats;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_current_lineup;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- ─── 8. RPC: undo último evento ───────────────────────────
CREATE OR REPLACE FUNCTION public.undo_last_play(p_game_session_id UUID)
RETURNS TABLE(deleted_event_type TEXT, deleted_player_id UUID) LANGUAGE plpgsql AS $$
DECLARE
  v_play RECORD;
BEGIN
  SELECT * INTO v_play
  FROM public.play_by_play
  WHERE game_session_id = p_game_session_id
    AND is_home_team = true
    AND event_type NOT IN ('game_start', 'period_start', 'period_end', 'game_end')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  -- Reverter score se tinha pontos
  IF v_play.points_delta > 0 THEN
    UPDATE public.game_sessions
    SET home_score = GREATEST(0, home_score - v_play.points_delta),
        updated_at = now()
    WHERE id = p_game_session_id;
  END IF;

  -- Reverter stats do jogador
  IF v_play.player_id IS NOT NULL THEN
    UPDATE public.player_game_stats SET
      pts             = GREATEST(0, pts             - CASE v_play.event_type WHEN '2pt_made' THEN 2 WHEN '3pt_made' THEN 3 WHEN 'ft_made' THEN 1 ELSE 0 END),
      fg2_made        = GREATEST(0, fg2_made        - CASE v_play.event_type WHEN '2pt_made' THEN 1 ELSE 0 END),
      fg2_att         = GREATEST(0, fg2_att         - CASE v_play.event_type WHEN '2pt_made' THEN 1 WHEN '2pt_miss' THEN 1 ELSE 0 END),
      fg3_made        = GREATEST(0, fg3_made        - CASE v_play.event_type WHEN '3pt_made' THEN 1 ELSE 0 END),
      fg3_att         = GREATEST(0, fg3_att         - CASE v_play.event_type WHEN '3pt_made' THEN 1 WHEN '3pt_miss' THEN 1 ELSE 0 END),
      ft_made         = GREATEST(0, ft_made         - CASE v_play.event_type WHEN 'ft_made' THEN 1 ELSE 0 END),
      ft_att          = GREATEST(0, ft_att          - CASE v_play.event_type WHEN 'ft_made' THEN 1 WHEN 'ft_miss' THEN 1 ELSE 0 END),
      reb_off         = GREATEST(0, reb_off         - CASE v_play.event_type WHEN 'rebound_off' THEN 1 ELSE 0 END),
      reb_def         = GREATEST(0, reb_def         - CASE v_play.event_type WHEN 'rebound_def' THEN 1 ELSE 0 END),
      ast             = GREATEST(0, ast             - CASE v_play.event_type WHEN 'assist' THEN 1 ELSE 0 END),
      stl             = GREATEST(0, stl             - CASE v_play.event_type WHEN 'steal' THEN 1 ELSE 0 END),
      blk             = GREATEST(0, blk             - CASE v_play.event_type WHEN 'block' THEN 1 ELSE 0 END),
      tov             = GREATEST(0, tov             - CASE v_play.event_type WHEN 'turnover' THEN 1 ELSE 0 END),
      fouls_committed = GREATEST(0, fouls_committed - CASE v_play.event_type WHEN 'foul_committed' THEN 1 ELSE 0 END),
      fouls_drawn     = GREATEST(0, fouls_drawn     - CASE v_play.event_type WHEN 'foul_drawn' THEN 1 ELSE 0 END),
      updated_at = now()
    WHERE game_session_id = p_game_session_id AND player_id = v_play.player_id;

    -- Recalcular eficiência
    PERFORM public.recalc_player_efficiency(p_game_session_id, v_play.player_id);
  END IF;

  -- Apagar o play
  DELETE FROM public.play_by_play WHERE id = v_play.id;

  RETURN QUERY SELECT v_play.event_type::TEXT, v_play.player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_play(UUID) TO authenticated;
