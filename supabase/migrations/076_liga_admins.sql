-- 076_liga_admins.sql
-- Super-admin da Liga INATEL: tabela liga_admins, função is_liga_admin(),
-- tabela de auditoria liga_resultado_audit, RLS em league_game_results e result_submissions.
-- Idempotente.

-- ─── 1. Tabela liga_admins ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.liga_admins (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.liga_admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'liga_admins' AND policyname = 'la_select_self'
  ) THEN
    CREATE POLICY "la_select_self" ON public.liga_admins
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- ─── 2. Função is_liga_admin() ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_liga_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.liga_admins WHERE user_id = auth.uid()
  );
$$;

-- ─── 3. Inserir darioleal8@gmail.com (se existir em auth.users) ───────────────

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'darioleal8@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'ATENÇÃO: darioleal8@gmail.com não encontrado em auth.users. '
                 'Depois de confirmar que a conta existe, executa manualmente: '
                 'INSERT INTO public.liga_admins(user_id) SELECT id FROM auth.users WHERE email=''darioleal8@gmail.com'';';
  ELSE
    INSERT INTO public.liga_admins(user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    RAISE NOTICE 'liga_admin inserido para darioleal8@gmail.com (user_id: %)', v_user_id;
  END IF;
END $$;

-- ─── 4. Tabela liga_resultado_audit ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.liga_resultado_audit (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jogo_id      UUID        NOT NULL,
  alterado_por UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  valor_antigo JSONB,
  valor_novo   JSONB       NOT NULL,
  motivo       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lra_jogo_id_idx ON public.liga_resultado_audit(jogo_id);

ALTER TABLE public.liga_resultado_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'liga_resultado_audit' AND policyname = 'lra_select_admin'
  ) THEN
    CREATE POLICY "lra_select_admin" ON public.liga_resultado_audit
      FOR SELECT TO authenticated USING (public.is_liga_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'liga_resultado_audit' AND policyname = 'lra_insert_admin'
  ) THEN
    CREATE POLICY "lra_insert_admin" ON public.liga_resultado_audit
      FOR INSERT TO authenticated WITH CHECK (public.is_liga_admin());
  END IF;
END $$;

-- ─── 5. RLS em league_game_results ──────────────────────────────────────────

ALTER TABLE public.league_game_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'league_game_results' AND policyname = 'lgr_select_public'
  ) THEN
    CREATE POLICY "lgr_select_public" ON public.league_game_results
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'league_game_results' AND policyname = 'lgr_all_liga_admin'
  ) THEN
    CREATE POLICY "lgr_all_liga_admin" ON public.league_game_results
      FOR ALL TO authenticated
      USING (public.is_liga_admin())
      WITH CHECK (public.is_liga_admin());
  END IF;
END $$;

-- ─── 6. RLS em result_submissions ───────────────────────────────────────────

ALTER TABLE public.result_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'result_submissions' AND policyname = 'rs_select_public'
  ) THEN
    CREATE POLICY "rs_select_public" ON public.result_submissions
      FOR SELECT USING (true);
  END IF;

  -- Qualquer pessoa pode submeter um resultado (formulário público)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'result_submissions' AND policyname = 'rs_insert_public'
  ) THEN
    CREATE POLICY "rs_insert_public" ON public.result_submissions
      FOR INSERT WITH CHECK (true);
  END IF;

  -- Liga admin pode fazer tudo
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'result_submissions' AND policyname = 'rs_all_liga_admin'
  ) THEN
    CREATE POLICY "rs_all_liga_admin" ON public.result_submissions
      FOR ALL TO authenticated
      USING (public.is_liga_admin())
      WITH CHECK (public.is_liga_admin());
  END IF;
END $$;
