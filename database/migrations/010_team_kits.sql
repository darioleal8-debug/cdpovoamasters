-- =========================================================
-- MIGRAÇÃO 010: Cores de equipamento por equipa
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

CREATE TABLE IF NOT EXISTS public.team_kits (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name         TEXT  NOT NULL,
  -- Coluna gerada para pesquisa case-insensitive
  team_name_lower   TEXT  GENERATED ALWAYS AS (lower(team_name)) STORED,
  -- Equipamento Casa
  jersey_home_color TEXT  NOT NULL DEFAULT '#1e3a8a',
  shorts_home_color TEXT  NOT NULL DEFAULT '#1e3a8a',
  -- Equipamento Fora
  jersey_away_color TEXT  NOT NULL DEFAULT '#ffffff',
  shorts_away_color TEXT  NOT NULL DEFAULT '#ffffff',
  -- Metadados
  notes             TEXT,
  updated_by        UUID  REFERENCES auth.users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_team_name UNIQUE (team_name_lower)
);

CREATE INDEX IF NOT EXISTS idx_tk_name ON public.team_kits (team_name_lower);

ALTER TABLE public.team_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tk_select" ON public.team_kits;
DROP POLICY IF EXISTS "tk_all"    ON public.team_kits;

CREATE POLICY "tk_select" ON public.team_kits FOR SELECT TO authenticated USING (true);
CREATE POLICY "tk_all"    ON public.team_kits FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at (reutiliza função criada na migração 008)
DROP TRIGGER IF EXISTS trg_tk_updated_at ON public.team_kits;
CREATE TRIGGER trg_tk_updated_at
  BEFORE UPDATE ON public.team_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inserir kit padrão para CD Póvoa Masters
INSERT INTO public.team_kits (team_name, jersey_home_color, shorts_home_color, jersey_away_color, shorts_away_color)
VALUES ('CD Póvoa Masters', '#1e3a8a', '#1e3a8a', '#ffffff', '#1e3a8a')
ON CONFLICT (team_name_lower) DO NOTHING;

-- =========================================================
-- Verificação:
-- SELECT * FROM public.team_kits;
-- =========================================================
