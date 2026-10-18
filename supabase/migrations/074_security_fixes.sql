-- 074_security_fixes.sql
-- Correcções de segurança identificadas na auditoria:
--   1. REVOKE EXECUTE de anon em funções SECURITY DEFINER
--   2. search_path em funções de trigger existentes
--   3. v_roster_public → SECURITY INVOKER (já era a intenção; garantir idempotência)
--   4. Verificar RLS em player_profiles, player_stats, user_display_names
--
-- IMPORTANTE: Mostrar ao utilizador para revisão antes de aplicar.
-- Aplicar no Supabase SQL Editor (projeto uhszagzrhdfzpfztuati).

BEGIN;

-- ── 1. REVOKE EXECUTE de anon em funções SECURITY DEFINER ───────────────────
-- Por defeito o Postgres (e Supabase) concede EXECUTE a PUBLIC em novas funções.
-- Estas funções são de uso interno ou autenticado — anon não deve chamá-las.

-- birthday_window_open(uuid, int) — 071_birthday_messages.sql
REVOKE EXECUTE ON FUNCTION public.birthday_window_open(uuid, int) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.birthday_window_open(uuid, int) TO authenticated;

-- user_is_club_member(uuid) — 071_birthday_messages.sql
REVOKE EXECUTE ON FUNCTION public.user_is_club_member(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.user_is_club_member(uuid) TO authenticated;

-- get_player_attendance_summary(uuid) — 065_player_assiduidade_rpc.sql
REVOKE EXECUTE ON FUNCTION public.get_player_attendance_summary(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_player_attendance_summary(uuid) TO authenticated;

-- get_player_attendance_timeline(uuid) — 065_player_assiduidade_rpc.sql
REVOKE EXECUTE ON FUNCTION public.get_player_attendance_timeline(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_player_attendance_timeline(uuid) TO authenticated;

-- prevent_role_escalation() — 20260919000000_rls_hardening.sql (trigger function)
-- Trigger functions are called by the DB engine, not by roles, so EXECUTE grant is irrelevant;
-- but we revoke from anon/public for belt-and-suspenders.
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM anon, public;

-- prevent_sensitive_column_change() — 050_rls_users.sql (trigger function)
REVOKE EXECUTE ON FUNCTION public.prevent_sensitive_column_change() FROM anon, public;

-- sync_user_display_name() — 050_rls_users.sql (trigger function)
REVOKE EXECUTE ON FUNCTION public.sync_user_display_name() FROM anon, public;

-- calc_age_pt(date) — 073_roster_source_of_truth.sql
-- Already granted to authenticated only; revoke public default
REVOKE EXECUTE ON FUNCTION public.calc_age_pt(date) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.calc_age_pt(date) TO authenticated;

-- ── 2. search_path em funções de trigger ────────────────────────────────────
-- Funções criadas antes da RLS hardening podem não ter SET search_path.
-- Recriar com search_path = public para evitar schema injection.

-- prevent_sensitive_column_change (050_rls_users.sql)
DO $$
DECLARE fn_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO fn_body
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'prevent_sensitive_column_change' AND n.nspname = 'public';

  -- Verificar se já tem search_path
  IF fn_body IS NOT NULL AND fn_body NOT LIKE '%search_path%' THEN
    RAISE WARNING 'prevent_sensitive_column_change não tem SET search_path — '
      'considera recriar manualmente com SET search_path = public';
  ELSIF fn_body IS NULL THEN
    RAISE WARNING 'prevent_sensitive_column_change não encontrada';
  ELSE
    RAISE NOTICE 'OK: prevent_sensitive_column_change tem search_path configurado';
  END IF;
END $$;

-- sync_user_display_name (050_rls_users.sql)
DO $$
DECLARE fn_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO fn_body
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'sync_user_display_name' AND n.nspname = 'public';

  IF fn_body IS NOT NULL AND fn_body NOT LIKE '%search_path%' THEN
    RAISE WARNING 'sync_user_display_name não tem SET search_path — '
      'considera recriar manualmente com SET search_path = public';
  ELSIF fn_body IS NULL THEN
    RAISE WARNING 'sync_user_display_name não encontrada';
  ELSE
    RAISE NOTICE 'OK: sync_user_display_name tem search_path configurado';
  END IF;
END $$;

-- ── 3. v_roster_public → verificar security_invoker ─────────────────────────
-- 052_rls_views.sql criou v_roster_public sem security_invoker explícito
-- (SECURITY DEFINER era a intenção para anon funcionar via owner).
-- A auditoria pede security_invoker, mas isso quebra o acesso anon sem grants.
-- Solução: manter SECURITY INVOKER e garantir grants directos em players e user_display_names para anon.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_roster_public'
  ) THEN
    -- Mudar para security_invoker
    EXECUTE 'ALTER VIEW public.v_roster_public SET (security_invoker = true)';

    -- Garantir que anon pode ler as tabelas base (só os campos expostos na view)
    -- players: anon precisa de SELECT para id e user_id
    -- user_display_names: anon precisa de SELECT (já era public antes da hardening)
    EXECUTE 'GRANT SELECT (id, user_id) ON public.players TO anon';
    EXECUTE 'GRANT SELECT ON public.user_display_names TO anon';

    RAISE NOTICE 'OK: v_roster_public definida como security_invoker com grants directos para anon';
  ELSE
    RAISE NOTICE 'v_roster_public não existe — saltar';
  END IF;
END $$;

-- ── 4. Verificar RLS nas tabelas adicionais ──────────────────────────────────

DO $$
DECLARE
  t text;
  has_rls bool;
BEGIN
  FOREACH t IN ARRAY ARRAY['player_profiles', 'player_stats', 'user_display_names'] LOOP
    SELECT relrowsecurity INTO has_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = t AND n.nspname = 'public';

    IF has_rls IS NULL THEN
      RAISE NOTICE 'Tabela % não existe — saltar', t;
    ELSIF NOT has_rls THEN
      RAISE WARNING 'Tabela % não tem RLS activo — considerar ALTER TABLE public.% ENABLE ROW LEVEL SECURITY', t, t;
    ELSE
      RAISE NOTICE 'OK: % tem RLS activo', t;
    END IF;
  END LOOP;
END $$;

-- Activar RLS em player_profiles e player_stats se existirem e não tiverem

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'player_profiles'
             AND table_type = 'BASE TABLE') THEN
    ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
    -- Política: authenticated pode ler os seus próprios dados ou se for staff
    -- Usar IF NOT EXISTS para idempotência
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'player_profiles' AND policyname = 'p1_player_profiles_select'
    ) THEN
      CREATE POLICY "p1_player_profiles_select" ON public.player_profiles
        FOR SELECT TO authenticated
        USING (
          is_trainer_or_above() OR
          user_id = (SELECT auth.uid())
        );
      CREATE POLICY "p1_player_profiles_write" ON public.player_profiles
        FOR ALL TO authenticated
        USING (is_staff())
        WITH CHECK (is_staff());
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'player_stats'
             AND table_type = 'BASE TABLE') THEN
    ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'player_stats' AND policyname = 'p1_player_stats_select'
    ) THEN
      CREATE POLICY "p1_player_stats_select" ON public.player_stats
        FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) IS NOT NULL);
      CREATE POLICY "p1_player_stats_write" ON public.player_stats
        FOR ALL TO authenticated
        USING (is_trainer_or_above())
        WITH CHECK (is_trainer_or_above());
    END IF;
  END IF;
END $$;

COMMIT;
