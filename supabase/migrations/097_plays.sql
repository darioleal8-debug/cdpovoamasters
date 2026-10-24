-- 097_plays.sql
-- Laboratório de Jogadas: tabelas plays e play_progress com RLS

-- ─── Helper functions ─────────────────────────────────────────────────────────

-- Membro ativo do clube (qualquer role, ativo)
CREATE OR REPLACE FUNCTION public.is_club_member()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND active = true
  )
$$;

-- Editor de jogadas: admin ou treinador (primário ou secundário)
CREATE OR REPLACE FUNCTION public.is_play_editor()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND (
      role IN ('admin', 'treinador')
      OR (roles_extra IS NOT NULL AND roles_extra ?| ARRAY['admin','treinador'])
    )
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_club_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_play_editor() TO authenticated;

-- ─── plays ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plays (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club         text        NOT NULL DEFAULT 'default',
  name         text        NOT NULL,
  eyebrow      text,
  category     text        NOT NULL,
  note         text,
  init         jsonb       NOT NULL,
  steps        jsonb       NOT NULL,
  options      jsonb       NOT NULL,
  status       text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','published')),
  ai_prompt    text,
  ai_history   jsonb       NOT NULL DEFAULT '[]',
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS plays_club_status_idx ON public.plays (club, status);
CREATE INDEX IF NOT EXISTS plays_created_by_idx  ON public.plays (created_by);
CREATE INDEX IF NOT EXISTS plays_published_at_idx ON public.plays (published_at DESC);

-- ─── play_progress ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.play_progress (
  play_id         uuid        NOT NULL REFERENCES public.plays(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at  timestamptz NOT NULL DEFAULT now(),
  studied_at      timestamptz,
  PRIMARY KEY (play_id, user_id)
);

CREATE INDEX IF NOT EXISTS pp_user_idx    ON public.play_progress (user_id);
CREATE INDEX IF NOT EXISTS pp_studied_idx ON public.play_progress (play_id) WHERE studied_at IS NOT NULL;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.plays_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plays_updated_at ON public.plays;
CREATE TRIGGER plays_updated_at
  BEFORE UPDATE ON public.plays
  FOR EACH ROW EXECUTE FUNCTION public.plays_set_updated_at();

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plays         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_progress TO authenticated;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.plays         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_progress ENABLE ROW LEVEL SECURITY;

-- plays: membros veem publicadas; editores veem todas
DROP POLICY IF EXISTS "plays_select" ON public.plays;
CREATE POLICY "plays_select" ON public.plays
  FOR SELECT TO authenticated
  USING (
    (status = 'published' AND public.is_club_member())
    OR public.is_play_editor()
  );

-- plays: só editores criam / alteram / apagam
DROP POLICY IF EXISTS "plays_insert" ON public.plays;
CREATE POLICY "plays_insert" ON public.plays
  FOR INSERT TO authenticated
  WITH CHECK (public.is_play_editor());

DROP POLICY IF EXISTS "plays_update" ON public.plays;
CREATE POLICY "plays_update" ON public.plays
  FOR UPDATE TO authenticated
  USING  (public.is_play_editor())
  WITH CHECK (public.is_play_editor());

DROP POLICY IF EXISTS "plays_delete" ON public.plays;
CREATE POLICY "plays_delete" ON public.plays
  FOR DELETE TO authenticated
  USING (public.is_play_editor());

-- play_progress: utilizador lê/escreve as suas; editores leem todas do clube
DROP POLICY IF EXISTS "pp_select" ON public.play_progress;
CREATE POLICY "pp_select" ON public.play_progress
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_play_editor()
  );

DROP POLICY IF EXISTS "pp_insert" ON public.play_progress;
CREATE POLICY "pp_insert" ON public.play_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pp_update" ON public.play_progress;
CREATE POLICY "pp_update" ON public.play_progress
  FOR UPDATE TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
