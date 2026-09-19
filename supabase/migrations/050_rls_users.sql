-- =================================================================
-- 050_rls_users.sql
-- Phase 1.1: users table hardening
--   1. Helper SECURITY DEFINER functions (replaces 20260919000000)
--   2. Trigger: block sensitive field changes for non-admin sessions
--   3. user_display_names table (safe public columns, trigger-synced)
--   4. Granular RLS policies on users
--
-- Idempotent: DROP/CREATE OR REPLACE throughout.
-- Safe to run after 20260919000000_rls_hardening.sql (supersedes its
-- users-related functions, trigger, and policies).
--
-- ROLLBACK:
--   DROP TRIGGER  IF EXISTS enforce_sensitive_columns    ON public.users;
--   DROP TRIGGER  IF EXISTS sync_display_name            ON public.users;
--   DROP FUNCTION IF EXISTS public.prevent_sensitive_column_change();
--   DROP FUNCTION IF EXISTS public.sync_user_display_name();
--   DROP FUNCTION IF EXISTS public.current_user_role();
--   DROP FUNCTION IF EXISTS public.is_admin();
--   DROP FUNCTION IF EXISTS public.is_staff();
--   DROP FUNCTION IF EXISTS public.is_trainer_or_above();
--   DROP TABLE    IF EXISTS public.user_display_names;
--   -- Then drop all p1_users_* policies and re-enable old open policy.
-- =================================================================

BEGIN;

-- -----------------------------------------------------------------
-- 1. Helper functions
--    SECURITY DEFINER, search_path = '' (fully qualified refs),
--    STABLE, revoke from anon/public, grant to authenticated.
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = ''
AS $$
  SELECT role FROM public.users
  WHERE id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trainer_or_above()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista', 'treinador')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role()   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin()            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_staff()            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_trainer_or_above() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.current_user_role()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trainer_or_above() TO authenticated;

-- -----------------------------------------------------------------
-- 2. Trigger: bloqueia alteração de campos sensíveis
--
--    auth.uid() IS NULL  → service role ou postgres → passa sempre
--    is_admin()          → admin autenticado → passa sempre
--    Qualquer outro      → bloqueia role/status/active/roles_extra/
--                          must_change_password
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_sensitive_column_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  -- Service role / postgres (sem JWT) → passa sempre
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admin autenticado → passa sempre
  IF EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- Utilizador não-admin: bloqueia campos protegidos
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Sem permissão para alterar o campo role';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Sem permissão para alterar o campo status';
  END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Sem permissão para alterar o campo active';
  END IF;
  IF NEW.roles_extra IS DISTINCT FROM OLD.roles_extra THEN
    RAISE EXCEPTION 'Sem permissão para alterar o campo roles_extra';
  END IF;
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    RAISE EXCEPTION 'Sem permissão para alterar o campo must_change_password';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sensitive_columns ON public.users;
DROP TRIGGER IF EXISTS enforce_no_role_escalation ON public.users; -- substitui o da 20260919000000
CREATE TRIGGER enforce_sensitive_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sensitive_column_change();

-- -----------------------------------------------------------------
-- 3. Tabela user_display_names
--    Espelha as colunas seguras de users para leitura lateral.
--    Mantida exclusivamente por trigger — sem escrita directa de authenticated.
--    Usada por:
--      • app/player/minha-area/page.tsx (remetentes de chat)
--      • app/api/player/comunicados/route.ts (senders)
-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_display_names (
  id        uuid    PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name      text    NOT NULL,
  role      text    NOT NULL,
  photo_url text
);

COMMENT ON TABLE public.user_display_names IS
  'Safe read-only mirror of users(id, name, role, photo_url). '
  'Managed exclusively by the sync_display_name trigger. '
  'SELECT open to all authenticated; no direct write permitted.';

-- Trigger de sync em users → user_display_names
CREATE OR REPLACE FUNCTION public.sync_user_display_name()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_display_names (id, name, role, photo_url)
  VALUES (NEW.id, NEW.name, NEW.role, NEW.photo_url)
  ON CONFLICT (id) DO UPDATE SET
    name      = EXCLUDED.name,
    role      = EXCLUDED.role,
    photo_url = EXCLUDED.photo_url;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_display_name ON public.users;
CREATE TRIGGER sync_display_name
  AFTER INSERT OR UPDATE OF name, role, photo_url
  ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_display_name();

-- Backfill inicial
INSERT INTO public.user_display_names (id, name, role, photo_url)
SELECT id, name, role, photo_url FROM public.users
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  role      = EXCLUDED.role,
  photo_url = EXCLUDED.photo_url;

-- RLS em user_display_names
ALTER TABLE public.user_display_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "p1_user_display_names_select" ON public.user_display_names
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- Sem políticas de escrita → authenticated não pode escrever directamente
-- (só service role e postgres via trigger têm acesso de escrita)
REVOKE INSERT, UPDATE, DELETE ON public.user_display_names FROM authenticated, anon;

-- -----------------------------------------------------------------
-- 4. Políticas estritas em users
--    SELECT: só própria linha  OU  is_trainer_or_above()
--    UPDATE: própria linha (trigger bloqueia campos sensíveis)
--            + admin pode editar qualquer linha
--    INSERT/DELETE: só admin
-- -----------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remove todas as políticas existentes em users (inclui as da 20260919000000)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', r.policyname);
  END LOOP;
END $$;

-- SELECT: própria linha
CREATE POLICY "p1_users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- SELECT: todas as linhas para trainer/staff
--   Cobre: use-roster.ts (dashboard), use-live-game.ts (treinador), rotas de chat
CREATE POLICY "p1_users_select_staff" ON public.users
  FOR SELECT TO authenticated
  USING ((SELECT public.is_trainer_or_above()));

-- UPDATE: própria linha (trigger bloqueia campos sensíveis)
CREATE POLICY "p1_users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING    (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- UPDATE: admin pode editar qualquer linha
CREATE POLICY "p1_users_update_admin" ON public.users
  FOR UPDATE TO authenticated
  USING    ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- INSERT: só admin (criação de utilizadores via painel)
CREATE POLICY "p1_users_insert_admin" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

-- DELETE: só admin
CREATE POLICY "p1_users_delete_admin" ON public.users
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- -----------------------------------------------------------------
-- Verificações finais
-- -----------------------------------------------------------------

DO $$
BEGIN
  -- Confirmar que user_display_names tem dados
  IF (SELECT count(*) FROM public.user_display_names) = 0 THEN
    RAISE WARNING 'user_display_names está vazia após backfill — verificar';
  ELSE
    RAISE NOTICE 'user_display_names: % linhas após backfill',
      (SELECT count(*) FROM public.user_display_names);
  END IF;

  -- Confirmar que políticas p1_users_* foram criadas
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users'
        AND policyname LIKE 'p1_users_%') < 5 THEN
    RAISE WARNING 'Menos de 5 políticas p1_users_* criadas — verificar';
  END IF;
END $$;

COMMIT;
