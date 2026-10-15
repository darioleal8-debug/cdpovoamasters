-- =================================================================
-- 051_rls_live_game_anon.sql
-- Phase 1.2: anon SELECT on live game tables
--
-- /live/[id] is a public spectator page (no auth required).
-- It uses createClient() (anon key) and reads game_sessions,
-- player_game_stats, and play_by_play.
--
-- The REVOKE ALL FROM anon in 20260919000000 stripped table grants.
-- This migration restores only the three tables needed for spectators.
--
-- Idempotent: DROP POLICY IF EXISTS + GRANT is safe to re-run.
-- =================================================================

-- 1. Restore SELECT grant for anon on live game tables
GRANT SELECT ON public.game_sessions      TO anon;
GRANT SELECT ON public.player_game_stats  TO anon;
GRANT SELECT ON public.play_by_play       TO anon;

-- 2. Replace authenticated-only SELECT policies with open SELECT
--    (no TO clause = applies to all roles that have the table grant)

DROP POLICY IF EXISTS "p1_game_sessions_select"     ON public.game_sessions;
DROP POLICY IF EXISTS "p1_player_game_stats_select" ON public.player_game_stats;
DROP POLICY IF EXISTS "p1_play_by_play_select"      ON public.play_by_play;

CREATE POLICY "p1_game_sessions_select" ON public.game_sessions
  FOR SELECT USING (true);

CREATE POLICY "p1_player_game_stats_select" ON public.player_game_stats
  FOR SELECT USING (true);

CREATE POLICY "p1_play_by_play_select" ON public.play_by_play
  FOR SELECT USING (true);

-- Write policies (INSERT/UPDATE/DELETE) remain restricted to
-- is_trainer_or_above() — anon never writes even with SELECT grant.

-- -----------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------
DO $$
DECLARE
  missing_grants int;
  missing_policies int;
BEGIN
  SELECT count(*) INTO missing_grants
  FROM (
    SELECT 'game_sessions'     AS t UNION ALL
    SELECT 'player_game_stats'    UNION ALL
    SELECT 'play_by_play'
  ) expected
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name   = expected.t
      AND grantee      = 'anon'
      AND privilege_type = 'SELECT'
  );

  IF missing_grants > 0 THEN
    RAISE WARNING '% tabela(s) sem GRANT SELECT para anon', missing_grants;
  ELSE
    RAISE NOTICE 'OK: GRANT SELECT para anon em game_sessions, player_game_stats, play_by_play';
  END IF;

  SELECT count(*) INTO missing_policies
  FROM (
    SELECT 'game_sessions'     AS t UNION ALL
    SELECT 'player_game_stats'    UNION ALL
    SELECT 'play_by_play'
  ) expected
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = expected.t
      AND policyname LIKE 'p1_%select'
  );

  IF missing_policies > 0 THEN
    RAISE WARNING '% política(s) p1_*_select em falta', missing_policies;
  ELSE
    RAISE NOTICE 'OK: políticas p1_*_select criadas nas 3 tabelas';
  END IF;
END $$;
