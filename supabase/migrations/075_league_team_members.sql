-- 075_league_team_members.sql
-- Contas de delegado de equipa da liga (isoladas de public.users)
-- Idempotente

CREATE TABLE IF NOT EXISTS public.league_team_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID        NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL DEFAULT 'delegate'
                          CHECK (role IN ('delegate')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS ltm_user_id_idx  ON public.league_team_members(user_id);
CREATE INDEX IF NOT EXISTS ltm_team_id_idx  ON public.league_team_members(team_id);

ALTER TABLE public.league_team_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Delegados lêem a sua própria filiação
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_team_members' AND policyname = 'p1_ltm_select_self'
  ) THEN
    CREATE POLICY "p1_ltm_select_self" ON public.league_team_members
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  -- Admin faz tudo
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_team_members' AND policyname = 'p1_ltm_admin'
  ) THEN
    CREATE POLICY "p1_ltm_admin" ON public.league_team_members
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;
