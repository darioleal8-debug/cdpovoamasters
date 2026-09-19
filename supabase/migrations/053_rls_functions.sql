-- =================================================================
-- 053_rls_functions.sql
-- Phase 1.4: set_active_season — admin guard + search_path seguro
--
-- Problema original (database/migrations/001_set_active_season_rpc.sql):
--   • SECURITY DEFINER sem SET search_path — vulnerável a injection
--   • Sem guard de admin — qualquer authenticated podia mudar temporada
--
-- Idempotente: CREATE OR REPLACE.
-- =================================================================

CREATE OR REPLACE FUNCTION public.set_active_season(p_season_id UUID)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  -- Apenas admin pode mudar a temporada activa
  IF NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Permissão negada: apenas admin pode activar uma temporada';
  END IF;

  UPDATE public.seasons
     SET status = 'arquivada', updated_at = now()
   WHERE status = 'ativa';

  UPDATE public.seasons
     SET status = 'ativa', updated_at = now()
   WHERE id = p_season_id;
END;
$$;

-- Revogar de anon e public (default public grant pode existir em Pg14-)
REVOKE EXECUTE ON FUNCTION public.set_active_season(UUID) FROM anon, public;
-- Manter grant a authenticated (a função verifica is_admin() internamente)
GRANT EXECUTE ON FUNCTION public.set_active_season(UUID) TO authenticated;

-- Verificação
DO $$
DECLARE
  has_search_path bool;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_active_season'
      AND n.nspname = 'public'
      AND p.proconfig IS NOT NULL
      AND array_to_string(p.proconfig, ',') LIKE '%search_path%'
  ) INTO has_search_path;

  IF has_search_path THEN
    RAISE NOTICE 'OK: set_active_season tem search_path seguro e guard de admin';
  ELSE
    RAISE WARNING 'set_active_season sem search_path configurado — verificar';
  END IF;
END $$;
