-- Consumo de IA da Liga INATEL (folhas de jogo e estatísticas submetidas): atribuído à equipa/clube.
-- source: 'app' = app de gestão do clube (conta para o limite mensal); 'liga' = Liga INATEL (só registo).
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','liga'));
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS league_team_id uuid REFERENCES public.league_teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_usage_source_month_idx ON public.ai_usage (source, month);
