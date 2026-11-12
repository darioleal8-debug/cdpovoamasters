-- Fase 3c: Master Admin (platform_admins) + um clube INATIVO por equipa real da Liga.
-- JÁ APLICADA em produção. Clubes inativos não têm membros: delegados não acedem à app de gestão.
DO $mig$
DECLARE v_master uuid;
BEGIN
  SELECT id INTO v_master FROM auth.users WHERE lower(email) = 'darioleal8@gmail.com';
  IF v_master IS NULL THEN RAISE EXCEPTION 'master admin nao encontrado'; END IF;

  CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS platform_admins_select_self ON public.platform_admins;
  CREATE POLICY platform_admins_select_self ON public.platform_admins FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
  REVOKE ALL ON public.platform_admins FROM anon;
  INSERT INTO public.platform_admins (user_id) VALUES (v_master) ON CONFLICT DO NOTHING;

  CREATE OR REPLACE FUNCTION public.is_master_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())) $f$;
  REVOKE ALL ON FUNCTION public.is_master_admin() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated, service_role;

  CREATE OR REPLACE FUNCTION public.my_club_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT CASE WHEN public.is_master_admin()
       THEN coalesce((SELECT array_agg(id) FROM public.clubs), '{}'::uuid[])
       ELSE coalesce((SELECT array_agg(m.club_id) FROM public.club_members m JOIN public.clubs c ON c.id = m.club_id
                      WHERE m.user_id = (SELECT auth.uid()) AND m.active AND c.active), '{}'::uuid[]) END $f$;

  CREATE OR REPLACE FUNCTION public.shares_club_with(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT p_user = (SELECT auth.uid()) OR public.is_master_admin() OR EXISTS (
        SELECT 1 FROM public.club_members a JOIN public.club_members b ON b.club_id = a.club_id
        JOIN public.clubs c ON c.id = a.club_id AND c.active
        WHERE a.user_id = (SELECT auth.uid()) AND a.active AND b.user_id = p_user AND b.active) $f$;

  DROP POLICY IF EXISTS clubs_admin_write ON public.clubs;
  CREATE POLICY clubs_admin_write ON public.clubs FOR ALL TO authenticated USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());
  DROP POLICY IF EXISTS club_members_admin_all ON public.club_members;
  CREATE POLICY club_members_admin_all ON public.club_members FOR ALL TO authenticated USING (public.is_master_admin()) WITH CHECK (public.is_master_admin());

  INSERT INTO public.clubs (name, slug, league_team_id, active)
  SELECT lt.name,
         trim(both '-' from regexp_replace(lower(translate(lt.name, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÉÈÊÍÓÔÕÚÇ', 'aaaaaeeeeiiiiooooouuuucAAAAEEEIOOOUC')), '[^a-z0-9]+', '-', 'g')),
         lt.id, false
  FROM public.league_teams lt
  WHERE NOT lt.is_our_team AND lt.name NOT LIKE 'Vencedor Jogo %' AND lt.name <> 'Equipa Teste'
    AND NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.league_team_id = lt.id)
  ON CONFLICT (slug) DO NOTHING;
END
$mig$;
