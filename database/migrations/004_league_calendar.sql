-- =========================================================
-- MIGRAÇÃO 004: Calendário INATEL — Equipas e Importação
-- Aplicar em: Supabase Dashboard > SQL Editor > New Query
-- =========================================================

-- ─── Equipas da Liga ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_teams (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200) NOT NULL,
  normalized_name   VARCHAR(200) NOT NULL,
  ccd_number        VARCHAR(50),
  contact_name      VARCHAR(200),
  contact_phone     VARCHAR(50),
  home_pavilion     VARCHAR(300),
  locality          VARCHAR(150),
  is_our_team       BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_league_team UNIQUE (normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_league_teams_name ON public.league_teams (normalized_name);

ALTER TABLE public.league_teams ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'league_teams' AND policyname = 'league_teams_auth') THEN
    CREATE POLICY "league_teams_auth" ON public.league_teams
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── Log de importações ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_imports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        UUID        REFERENCES public.seasons(id),
  filename         VARCHAR(300),
  file_type        VARCHAR(10) CHECK (file_type IN ('pdf', 'excel', 'csv', 'manual')),
  our_team_name    VARCHAR(200) NOT NULL DEFAULT 'CD Póvoa Masters',
  jornadas_found   SMALLINT    NOT NULL DEFAULT 0,
  teams_found      SMALLINT    NOT NULL DEFAULT 0,
  teams_created    SMALLINT    NOT NULL DEFAULT 0,
  games_found      SMALLINT    NOT NULL DEFAULT 0,
  games_created    SMALLINT    NOT NULL DEFAULT 0,
  games_skipped    SMALLINT    NOT NULL DEFAULT 0,
  games_updated    SMALLINT    NOT NULL DEFAULT 0,
  errors           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  raw_games        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  imported_by      UUID        REFERENCES public.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_imports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'calendar_imports' AND policyname = 'cal_imports_auth') THEN
    CREATE POLICY "cal_imports_auth" ON public.calendar_imports
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── Trigger updated_at para league_teams ────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE TRIGGER trg_league_teams_updated_at
      BEFORE UPDATE ON public.league_teams
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Inserir equipa da casa por defeito ───────────────────
INSERT INTO public.league_teams (name, normalized_name, is_our_team)
VALUES ('CD Póvoa Masters', 'cd povoa masters', true)
ON CONFLICT (normalized_name) DO NOTHING;
