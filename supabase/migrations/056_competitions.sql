-- 056_competitions.sql
-- Tabela genérica de competições públicas (Liga INATEL, etc.)
-- Idempotente: segura para correr múltiplas vezes

CREATE TABLE IF NOT EXISTS public.competitions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(200) NOT NULL,
  slug             VARCHAR(80)  NOT NULL,
  short_name       VARCHAR(50),
  logo_url         TEXT,
  description      TEXT,
  -- Liga com events.competition (ex: 'Liga', 'Taça')
  competition_key  VARCHAR(20),
  -- Época activa desta competição (helper para queries rápidas)
  season_id        UUID         REFERENCES public.seasons(id) ON DELETE SET NULL,
  is_public        BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS competitions_slug_idx
  ON public.competitions(slug);

CREATE INDEX IF NOT EXISTS competitions_key_idx
  ON public.competitions(competition_key);

-- RLS
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'competitions' AND policyname = 'p1_competitions_select_public'
  ) THEN
    CREATE POLICY "p1_competitions_select_public" ON public.competitions
      FOR SELECT TO anon, authenticated
      USING (is_public = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'competitions' AND policyname = 'p1_competitions_write_admin'
  ) THEN
    CREATE POLICY "p1_competitions_write_admin" ON public.competitions
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Seed: Liga INATEL ligada à época activa
DO $$
DECLARE v_season_id UUID;
BEGIN
  SELECT id INTO v_season_id FROM public.seasons WHERE status = 'ativa' LIMIT 1;

  INSERT INTO public.competitions (name, slug, short_name, competition_key, season_id, is_public)
  VALUES ('Liga INATEL', 'liga-inatel', 'INATEL', 'Liga', v_season_id, true)
  ON CONFLICT (slug) DO UPDATE SET
    season_id  = EXCLUDED.season_id,
    updated_at = now();
END $$;
