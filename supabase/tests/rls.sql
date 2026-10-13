-- ============================================================
-- RLS TEST SCRIPT — Phase 1
-- Run in Supabase SQL editor AFTER applying the migration.
-- Uses SET LOCAL to simulate different roles; each test should
-- return 0 rows (blocked) or specific counts (allowed).
--
-- How to run:
--   1. Copy each block into the Supabase SQL editor
--   2. Run as postgres / service_role (bypasses RLS for setup)
--   3. Adjust the UUIDs to real users from your DB
-- ============================================================

-- ============================================================
-- SETUP: Replace these with real UUIDs from your DB
-- ============================================================

-- \set admin_id     'replace-with-admin-user-id'
-- \set jogador_id   'replace-with-jogador-user-id'
-- \set treinador_id 'replace-with-treinador-user-id'

-- ============================================================
-- TEST 1: anon cannot read player_payments
-- Expected: 0 rows (RLS blocks anon)
-- ============================================================
/*
SET LOCAL role = anon;
SELECT count(*) AS anon_can_read_payments FROM public.player_payments;
-- Expected: 0
RESET role;
*/

-- ============================================================
-- TEST 2: anon can read public tables
-- Expected: >0 rows
-- ============================================================
/*
SET LOCAL role = anon;
SELECT count(*) AS anon_seasons FROM public.seasons;        -- expected: >0
SELECT count(*) AS anon_palmares FROM public.palmares;      -- expected: >=0
SELECT count(*) AS anon_club_settings FROM public.club_settings; -- expected: 1
RESET role;
*/

-- ============================================================
-- TEST 3: jogador cannot read other players' payments
-- Expected: only own rows
-- ============================================================
/*
-- First, find your jogador's player_id:
SELECT p.id, u.name, u.role
FROM public.players p
JOIN public.users u ON u.id = p.user_id
WHERE u.role = 'jogador'
LIMIT 5;

-- Then simulate authenticated call as that jogador:
SET LOCAL "request.jwt.claims" = '{"sub":"<jogador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
SELECT count(*) AS jogador_payments FROM public.player_payments;
-- Expected: only rows where the linked player.user_id = jogador_auth_uid
RESET role;
*/

-- ============================================================
-- TEST 4: jogador cannot write to player_payments
-- Expected: ERROR (policy violation)
-- ============================================================
/*
SET LOCAL "request.jwt.claims" = '{"sub":"<jogador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
UPDATE public.player_payments
SET status = 'pago'
WHERE id = (SELECT id FROM public.player_payments LIMIT 1);
-- Expected: 0 rows updated (RLS blocks non-staff update)
RESET role;
*/

-- ============================================================
-- TEST 5: jogador cannot change their own role
-- Expected: ERROR from trigger
-- ============================================================
/*
SET LOCAL "request.jwt.claims" = '{"sub":"<jogador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
UPDATE public.users
SET role = 'admin'
WHERE id = '<jogador_auth_uid>';
-- Expected: EXCEPTION 'Não tem permissão para alterar o campo role'
RESET role;
*/

-- ============================================================
-- TEST 6: treinador can write to game_sessions
-- Expected: 1 row updated
-- ============================================================
/*
SET LOCAL "request.jwt.claims" = '{"sub":"<treinador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
UPDATE public.game_sessions
SET status = 'a_decorrer'
WHERE id = (SELECT id FROM public.game_sessions LIMIT 1);
-- Expected: 1 row updated (if policy works)
RESET role;
*/

-- ============================================================
-- TEST 7: jogador cannot write to game_sessions
-- Expected: 0 rows updated
-- ============================================================
/*
SET LOCAL "request.jwt.claims" = '{"sub":"<jogador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
UPDATE public.game_sessions
SET status = 'terminado'
WHERE id = (SELECT id FROM public.game_sessions LIMIT 1);
-- Expected: 0 rows (RLS blocks)
RESET role;
*/

-- ============================================================
-- TEST 8: anon cannot read financial tables
-- Expected: 0 rows
-- ============================================================
/*
SET LOCAL role = anon;
SELECT count(*) FROM public.financial_entries;    -- expected: 0
SELECT count(*) FROM public.financial_expenses;   -- expected: 0
RESET role;
*/

-- ============================================================
-- TEST 9: jogador cannot read financial tables
-- Expected: 0 rows
-- ============================================================
/*
SET LOCAL "request.jwt.claims" = '{"sub":"<jogador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
SELECT count(*) FROM public.financial_entries;  -- expected: 0
RESET role;
*/

-- ============================================================
-- TEST 10: Helper functions return correct values
-- ============================================================

-- Run as the actual jogador user (via Supabase JWT simulation):
/*
SET LOCAL "request.jwt.claims" = '{"sub":"<jogador_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
SELECT public.is_admin();           -- expected: false
SELECT public.is_staff();           -- expected: false
SELECT public.is_trainer_or_above(); -- expected: false
RESET role;

SET LOCAL "request.jwt.claims" = '{"sub":"<admin_auth_uid>","role":"authenticated"}';
SET LOCAL role = authenticated;
SELECT public.is_admin();           -- expected: true
SELECT public.is_staff();           -- expected: true
SELECT public.is_trainer_or_above(); -- expected: true
RESET role;
*/

-- ============================================================
-- TEST 11: Verify policies exist (smoke test after migration)
-- ============================================================

SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'p1_%'
ORDER BY tablename, policyname;
-- Expected: ~60+ rows with p1_* names

-- ============================================================
-- TEST 12: Verify anon CANNOT read sensitive tables
-- ============================================================

SELECT
  t.tablename,
  bool_or(p.policyname IS NOT NULL AND 'anon' = ANY(p.roles)) AS anon_has_explicit_policy
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename
  AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'player_payments', 'financial_entries', 'financial_expenses',
    'user_activation_tokens', 'player_payments_history'
  )
GROUP BY t.tablename;
-- Expected: all false (no anon policy on sensitive tables)

-- ============================================================
-- TEST 13: Verify storage bucket limits
-- ============================================================

SELECT id, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('player-photos', 'club-logos');
-- Expected:
--   player-photos | 5242880 | {image/jpeg,image/png,image/webp}
--   club-logos    | 2097152 | {image/jpeg,image/png,image/webp,image/svg+xml}

-- ============================================================
-- TEST 14: Verify trigger exists
-- ============================================================

SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'users'
  AND trigger_name = 'enforce_no_role_escalation';
-- Expected: 1 row, BEFORE UPDATE

-- ============================================================
-- TEST 15: Verify views are SECURITY INVOKER
-- ============================================================

SELECT
  viewname,
  CASE WHEN definition ILIKE '%security_invoker%' THEN 'invoker'
       WHEN definition ILIKE '%security_definer%' THEN 'definer'
       ELSE 'default (invoker)'
  END AS security_mode
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('v_roster', 'player_profiles', 'player_payment_summary',
                   'player_attendance_stats', 'player_stats');
-- NOTE: pg_views doesn't directly expose security_invoker setting;
-- check via:
SELECT relname, reloptions
FROM pg_class
WHERE relkind = 'v'
  AND relnamespace = 'public'::regnamespace
  AND relname IN ('v_roster', 'player_profiles', 'player_payment_summary',
                  'player_attendance_stats', 'player_stats');
-- Expected: reloptions contains 'security_invoker=true'
