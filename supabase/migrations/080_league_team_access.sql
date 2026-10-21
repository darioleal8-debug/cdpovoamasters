-- Migration 080: gestão de acessos por equipa na Liga INATEL

-- Função helper: devolve o team_id do utilizador autenticado (NULL se não for delegado)
CREATE OR REPLACE FUNCTION public.get_my_league_team_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT team_id FROM public.league_team_members WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Liga admin pode gerir todos os membros de equipa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_team_members' AND policyname = 'liga_admin_all_team_members'
  ) THEN
    CREATE POLICY "liga_admin_all_team_members" ON public.league_team_members
      FOR ALL TO authenticated
      USING  (public.is_liga_admin())
      WITH CHECK (public.is_liga_admin());
  END IF;
END
$$;

-- Delegado de equipa pode actualizar o logo da sua equipa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_teams' AND policyname = 'team_member_update_logo'
  ) THEN
    CREATE POLICY "team_member_update_logo" ON public.league_teams
      FOR UPDATE TO authenticated
      USING  (id = public.get_my_league_team_id())
      WITH CHECK (id = public.get_my_league_team_id());
  END IF;
END
$$;
