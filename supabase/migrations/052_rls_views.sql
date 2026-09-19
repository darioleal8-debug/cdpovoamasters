-- =================================================================
-- 052_rls_views.sql
-- Phase 1.3: Views — security_invoker + controlo de acesso anon
--
-- v_roster expõe campos sensíveis (email, phone, birth_date…).
-- Para a página pública /live/[id], criamos v_roster_public com
-- apenas player_id e name (security_definer, owner bypasses RLS
-- sobre players e user_display_names — seguro pois só expõe
-- o mesmo que user_display_names já disponibiliza).
--
-- As restantes views ficam security_invoker=true (já feito no
-- STEP 7 de 20260919000000, mas repetimos para idempotência).
-- Anon não tem acesso a nenhuma view sensível.
-- =================================================================

-- 1. View pública mínima para a página do espectador (/live/[id])
--    Expõe apenas player_id e name — sem dados sensíveis.
--    security_definer (default) — corre como owner, não precisa de
--    grant separado em players/user_display_names para anon.
CREATE OR REPLACE VIEW public.v_roster_public AS
SELECT
  p.id        AS player_id,
  udn.name    AS name
FROM public.players p
JOIN public.user_display_names udn ON udn.id = p.user_id;

COMMENT ON VIEW public.v_roster_public IS
  'Subset público de v_roster. Apenas player_id e name. '
  'Seguro para anon — usado pela página /live/[id] do espectador.';

GRANT SELECT ON public.v_roster_public TO anon, authenticated;

-- 2. security_invoker nas views sensíveis
--    (idempotente — o STEP 7 de 20260919000000 já devia ter feito isto)
DO $$
DECLARE v text;
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

-- 3. Garantir sem equívoco que anon não acede a views sensíveis
--    (REVOKE é no-op se já não havia grant — seguro repetir)
REVOKE SELECT ON public.v_roster               FROM anon;
REVOKE SELECT ON public.player_profiles        FROM anon;
REVOKE SELECT ON public.player_payment_summary FROM anon;
REVOKE SELECT ON public.player_attendance_stats FROM anon;
REVOKE SELECT ON public.player_stats           FROM anon;

-- Verificação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'v_roster_public'
      AND grantee = 'anon'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE WARNING 'GRANT SELECT em v_roster_public para anon não encontrado';
  ELSE
    RAISE NOTICE 'OK: anon pode ler v_roster_public';
  END IF;
END $$;
