-- ============================================================
-- PHASE 1: RLS HARDENING
-- Branch: hardening/rls
-- Date:   2026-09-19
--
-- OVERVIEW:
--   1. Helper SECURITY DEFINER functions (is_admin, is_staff, is_trainer_or_above)
--   2. Trigger to block privilege escalation on users.role
--   3. REVOKE ALL FROM anon; re-GRANT only public data
--   4. Drop all existing RLS policies (blanket ALL WITH TRUE)
--   5. Enable RLS on all tables
--   6. Granular per-role policies (prefixed p1_)
--   7. Views → SECURITY INVOKER
--   8. Storage bucket limits + storage policies
--
-- APPLY:
--   Run in Supabase SQL editor (project uhszagzrhdfzpfztuati)
--   Review each step before running — do NOT run without user confirmation.
--
-- ROLLBACK (run in reverse to undo):
-- ============================================================
-- -- 1. Drop trigger
-- DROP TRIGGER IF EXISTS enforce_no_role_escalation ON public.users;
-- DROP FUNCTION IF EXISTS public.prevent_role_escalation();
--
-- -- 2. Re-grant anon blanket access
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
--
-- -- 3. Drop all new p1_ policies
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT policyname, tablename FROM pg_policies
--            WHERE schemaname = 'public' AND policyname LIKE 'p1_%'
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
--   END LOOP;
-- END $$;
--
-- -- 4. Restore blanket authenticated policy per table
-- DO $$
-- DECLARE tbl text;
-- BEGIN
--   FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format(
--       'CREATE POLICY "allow_authenticated_all" ON public.%I
--        FOR ALL TO authenticated USING (true) WITH CHECK (true)',
--       tbl
--     );
--   END LOOP;
-- END $$;
--
-- -- 5. Drop helper functions
-- DROP FUNCTION IF EXISTS public.is_admin();
-- DROP FUNCTION IF EXISTS public.is_staff();
-- DROP FUNCTION IF EXISTS public.is_trainer_or_above();
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1 — Helper functions (SECURITY DEFINER + search_path)
-- Using (SELECT auth.uid()) to avoid auth_rls_initplan warning
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trainer_or_above()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista', 'treinador')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trainer_or_above() TO authenticated;

-- ============================================================
-- STEP 2 — Privilege escalation trigger on users table
-- Prevents any non-admin from changing their own role/roles_extra
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar o campo role';
  END IF;
  IF NEW.roles_extra IS DISTINCT FROM OLD.roles_extra AND NOT is_admin() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar o campo roles_extra';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_no_role_escalation ON public.users;
CREATE TRIGGER enforce_no_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ============================================================
-- STEP 3 — REVOKE anon from everything; re-grant only public data
-- ============================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Truly public data (visible without login)
-- Note: /api/public/* routes use adminClient so these are belt-and-suspenders,
-- but they allow direct Supabase calls from public pages if ever needed.
GRANT SELECT ON public.club_settings   TO anon;
GRANT SELECT ON public.club_events     TO anon;
GRANT SELECT ON public.palmares        TO anon;
GRANT SELECT ON public.seasons         TO anon;
GRANT INSERT ON public.access_requests TO anon;

-- ============================================================
-- STEP 4 — Drop ALL existing RLS policies
-- (removes the current "ALL WITH USING (TRUE)" blanket policies)
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- STEP 5 — Enable RLS on all affected tables
-- (safe to run even if already enabled)
-- ============================================================

ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_callups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_period_scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_current_lineup       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_court_stints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_by_play              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_stats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_payments_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_cash_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_substitutions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_kits                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palmares                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activation_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_imports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_teams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hist_seasons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hist_games                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hist_players              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hist_player_stats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_photo_templates    ENABLE ROW LEVEL SECURITY;

-- Conditional: tables that may or may not exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'payments'
             AND table_type = 'BASE TABLE') THEN
    EXECUTE 'ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'training_photos'
             AND table_type = 'BASE TABLE') THEN
    EXECUTE 'ALTER TABLE public.training_photos ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================
-- STEP 6 — Granular RLS policies (all prefixed p1_)
-- Convention: one policy per operation to avoid multiple_permissive_policies
-- Use (SELECT auth.uid()) everywhere to avoid auth_rls_initplan
-- ============================================================

-- ── IDENTITY ─────────────────────────────────────────────────

-- users: all authenticated can read (names needed throughout app);
--        own-row update only; admin full CRUD
-- Note: role-change prevention is enforced by the trigger above,
--       not by WITH CHECK (allows simpler policies)

CREATE POLICY "p1_users_select" ON public.users
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "p1_users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR is_admin());

CREATE POLICY "p1_users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "p1_users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (is_admin());

-- players: all authenticated can read; staff write
CREATE POLICY "p1_players_select" ON public.players
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_players_write" ON public.players
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- seasons: anon can read (grant above); authenticated read; staff write
CREATE POLICY "p1_seasons_select" ON public.seasons
  FOR SELECT USING (true); -- covers both anon (granted) and authenticated

CREATE POLICY "p1_seasons_write" ON public.seasons
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- user_activation_tokens: admin only
CREATE POLICY "p1_user_activation_tokens" ON public.user_activation_tokens
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── GAMES & LIVE ──────────────────────────────────────────────

-- events: authenticated read; staff write
CREATE POLICY "p1_events_select" ON public.events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_events_write" ON public.events
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- game_callups: player sees own callup; staff see all + write
-- player_id column verified via OpenAPI
CREATE POLICY "p1_game_callups_select" ON public.game_callups
  FOR SELECT TO authenticated
  USING (
    is_trainer_or_above() OR
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "p1_game_callups_write" ON public.game_callups
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- game_sessions: authenticated read (scores); trainer+ write (live game)
CREATE POLICY "p1_game_sessions_select" ON public.game_sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_game_sessions_write" ON public.game_sessions
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- game_period_scores
CREATE POLICY "p1_game_period_scores_select" ON public.game_period_scores
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_game_period_scores_write" ON public.game_period_scores
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- game_current_lineup: trainer+ only (live game management, no player-facing page)
CREATE POLICY "p1_game_current_lineup" ON public.game_current_lineup
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- player_court_stints: trainer+ only
CREATE POLICY "p1_player_court_stints" ON public.player_court_stints
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- play_by_play: authenticated read; trainer+ write/delete
CREATE POLICY "p1_play_by_play_select" ON public.play_by_play
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_play_by_play_write" ON public.play_by_play
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- player_game_stats: authenticated read (team stats on /estatisticas); trainer+ write
CREATE POLICY "p1_player_game_stats_select" ON public.player_game_stats
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_player_game_stats_write" ON public.player_game_stats
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- league_teams: authenticated read; staff write
CREATE POLICY "p1_league_teams_select" ON public.league_teams
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_league_teams_write" ON public.league_teams
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- ── TRAININGS ─────────────────────────────────────────────────

-- trainings: authenticated read; trainer+ write
CREATE POLICY "p1_trainings_select" ON public.trainings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_trainings_write" ON public.trainings
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- training_recurrence_rules: trainer+ only
CREATE POLICY "p1_training_recurrence_rules" ON public.training_recurrence_rules
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- training_attendance: staff full; player reads+updates own
-- player_id column verified via OpenAPI
CREATE POLICY "p1_training_attendance_staff" ON public.training_attendance
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

CREATE POLICY "p1_training_attendance_own_select" ON public.training_attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "p1_training_attendance_own_update" ON public.training_attendance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- training_notes: authenticated read (player area shows notes); trainer+ write
CREATE POLICY "p1_training_notes_select" ON public.training_notes
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_training_notes_write" ON public.training_notes
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- event_photos: authenticated read; trainer+ write
CREATE POLICY "p1_event_photos_select" ON public.event_photos
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_event_photos_write" ON public.event_photos
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- ── PAYMENTS & FINANCE ────────────────────────────────────────

-- player_payments: CRITICAL — player sees own rows only; staff full
-- player_id column verified via OpenAPI
CREATE POLICY "p1_player_payments_staff" ON public.player_payments
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

CREATE POLICY "p1_player_payments_own" ON public.player_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- player_payments_history: player sees own; staff read; admin full
-- payment_id (FK → player_payments.id) verified via OpenAPI; two-level join to reach player:
CREATE POLICY "p1_player_payments_history_staff" ON public.player_payments_history
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- payment_id is the FK column linking to player_payments.id (verified via OpenAPI)
CREATE POLICY "p1_player_payments_history_own" ON public.player_payments_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.player_payments pp
      JOIN public.players p ON p.id = pp.player_id
      WHERE pp.id = payment_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- payment_receipts: player sees own; staff full
-- payment_id is the FK column linking to player_payments.id (verified via OpenAPI)
CREATE POLICY "p1_payment_receipts_staff" ON public.payment_receipts
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

CREATE POLICY "p1_payment_receipts_own" ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.player_payments pp
      JOIN public.players p ON p.id = pp.player_id
      WHERE pp.id = payment_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- financial tables: staff only (all routes use adminClient anyway)
CREATE POLICY "p1_financial_entries" ON public.financial_entries
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

CREATE POLICY "p1_financial_expenses" ON public.financial_expenses
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

CREATE POLICY "p1_financial_cash_movements" ON public.financial_cash_movements
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- ── CHAT ──────────────────────────────────────────────────────
-- All chat routes use adminClient — these policies are purely defensive

-- chats: trainer+ full; player reads only threads they participate in
CREATE POLICY "p1_chats_staff" ON public.chats
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

CREATE POLICY "p1_chats_participant" ON public.chats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = id
        AND cp.user_id = (SELECT auth.uid())
    )
  );

-- chat_participants: trainer+ full; player reads own
CREATE POLICY "p1_chat_participants_staff" ON public.chat_participants
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

CREATE POLICY "p1_chat_participants_own" ON public.chat_participants
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- chat_messages: trainer+ full; player reads in own threads; can insert in own threads
-- chat_id and sender_id column names verified via OpenAPI
CREATE POLICY "p1_chat_messages_staff" ON public.chat_messages
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

CREATE POLICY "p1_chat_messages_participant_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_id
        AND cp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "p1_chat_messages_participant_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_id
        AND cp.user_id = (SELECT auth.uid())
    )
  );

-- game_substitutions: trainer+ only (live game management)
CREATE POLICY "p1_game_substitutions" ON public.game_substitutions
  FOR ALL TO authenticated
  USING (is_trainer_or_above())
  WITH CHECK (is_trainer_or_above());

-- chat_message_reads: handled conditionally below (table not yet in DB)

-- ── CLUB & CONTENT ────────────────────────────────────────────

-- club_settings: public read (anon grant above); staff write
CREATE POLICY "p1_club_settings_select" ON public.club_settings
  FOR SELECT USING (true);

CREATE POLICY "p1_club_settings_write" ON public.club_settings
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- club_events: public read; staff write
CREATE POLICY "p1_club_events_select" ON public.club_events
  FOR SELECT USING (true);

CREATE POLICY "p1_club_events_write" ON public.club_events
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- team_kits: authenticated read; staff write
CREATE POLICY "p1_team_kits_select" ON public.team_kits
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "p1_team_kits_write" ON public.team_kits
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- palmares: public read (anon grant above); admin write only
CREATE POLICY "p1_palmares_select" ON public.palmares
  FOR SELECT USING (true);

CREATE POLICY "p1_palmares_write" ON public.palmares
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── ADMIN / OPERATIONAL ───────────────────────────────────────

-- access_requests: anon insert (form submission); staff read; admin full
CREATE POLICY "p1_access_requests_insert" ON public.access_requests
  FOR INSERT WITH CHECK (true); -- anon INSERT was granted above

CREATE POLICY "p1_access_requests_staff_select" ON public.access_requests
  FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY "p1_access_requests_admin_write" ON public.access_requests
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- calendar_imports: staff write
CREATE POLICY "p1_calendar_imports" ON public.calendar_imports
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- player_photo_templates: staff only
CREATE POLICY "p1_player_photo_templates" ON public.player_photo_templates
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- ── HISTORICAL ────────────────────────────────────────────────

CREATE POLICY "p1_hist_seasons_select" ON public.hist_seasons
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_hist_seasons_admin" ON public.hist_seasons
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "p1_hist_games_select" ON public.hist_games
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_hist_games_admin" ON public.hist_games
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "p1_hist_players_select" ON public.hist_players
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_hist_players_admin" ON public.hist_players
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "p1_hist_player_stats_select" ON public.hist_player_stats
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_hist_player_stats_admin" ON public.hist_player_stats
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ── CONDITIONAL TABLES ────────────────────────────────────────

DO $$
BEGIN
  -- "payments" table (if exists as BASE TABLE, not view)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'payments'
             AND table_type = 'BASE TABLE') THEN
    -- payments.user_id links directly to auth.uid() (no players join needed)
    EXECUTE $pol$
      CREATE POLICY "p1_payments_staff" ON public.payments
        FOR ALL TO authenticated
        USING (is_staff()) WITH CHECK (is_staff());
      CREATE POLICY "p1_payments_own" ON public.payments
        FOR SELECT TO authenticated
        USING (user_id = (SELECT auth.uid()));
    $pol$;
  END IF;

  -- training_photos (if exists as BASE TABLE)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'training_photos'
             AND table_type = 'BASE TABLE') THEN
    EXECUTE $pol$
      CREATE POLICY "p1_training_photos_select" ON public.training_photos
        FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
      CREATE POLICY "p1_training_photos_write" ON public.training_photos
        FOR ALL TO authenticated
        USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
    $pol$;
  END IF;

  -- chat_message_reads (table exists in code but not yet in DB schema)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'chat_message_reads'
             AND table_type = 'BASE TABLE') THEN
    EXECUTE 'ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY';
    EXECUTE $pol$
      CREATE POLICY "p1_chat_message_reads_staff" ON public.chat_message_reads
        FOR ALL TO authenticated
        USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
      CREATE POLICY "p1_chat_message_reads_own_select" ON public.chat_message_reads
        FOR SELECT TO authenticated
        USING (user_id = (SELECT auth.uid()));
      CREATE POLICY "p1_chat_message_reads_own_insert" ON public.chat_message_reads
        FOR INSERT TO authenticated
        WITH CHECK (user_id = (SELECT auth.uid()));
    $pol$;
  END IF;
END $$;

-- ============================================================
-- STEP 7 — Views → SECURITY INVOKER (requires PostgreSQL 15+)
-- This ensures callers' RLS is applied when querying through views
-- ============================================================

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_roster',
    'player_profiles',
    'player_payment_summary',
    'player_attendance_stats',
    'player_stats'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = v
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- STEP 8 — Storage bucket limits
-- ============================================================

UPDATE storage.buckets
SET
  file_size_limit   = 5242880,  -- 5 MB
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'player-photos';

UPDATE storage.buckets
SET
  file_size_limit   = 2097152,  -- 2 MB
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
WHERE id = 'club-logos';

-- Storage policies: drop existing + create new
-- Note: we only touch the two buckets in scope; leave others untouched.

DROP POLICY IF EXISTS "club_logos_upload" ON storage.objects;
DROP POLICY IF EXISTS "p1_club_logos_upload" ON storage.objects;
DROP POLICY IF EXISTS "p1_player_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "p1_storage_read_auth" ON storage.objects;

-- Admins only can upload club logos
CREATE POLICY "p1_club_logos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'club-logos'
    AND (SELECT is_admin())
  );

-- Staff can upload/delete player photos
CREATE POLICY "p1_player_photos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (SELECT is_staff())
  );

-- Authenticated can read both buckets
CREATE POLICY "p1_storage_read_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('player-photos', 'club-logos'));

-- ============================================================
-- STEP 9 — Fix search_path on existing utility functions
-- ============================================================

DO $$
BEGIN
  -- Fix set_updated_at if it exists
  IF EXISTS (SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE p.proname = 'set_updated_at' AND n.nspname = 'public') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $body$
    $fn$;
  END IF;

  -- Fix recalc_player_efficiency if it exists
  IF EXISTS (SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE p.proname = 'recalc_player_efficiency' AND n.nspname = 'public') THEN
    RAISE NOTICE 'recalc_player_efficiency exists — verify it has SET search_path = public';
  END IF;

  -- Check set_active_season for admin protection
  IF EXISTS (SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE p.proname = 'set_active_season' AND n.nspname = 'public') THEN
    RAISE NOTICE 'set_active_season exists — verify it calls is_admin() or raises if not admin';
  END IF;
END $$;

COMMIT;
