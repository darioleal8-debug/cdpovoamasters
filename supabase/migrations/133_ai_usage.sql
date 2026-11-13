-- Controlo do gasto da API DeepSeek por clube/equipa.
-- ai_usage: uma linha por chamada (escrita só por service role). Leitura: Master Admin.
-- clubs.ai_monthly_budget_eur: limite mensal por clube (default 0,10 €).
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS ai_monthly_budget_eur numeric(8,4) NOT NULL DEFAULT 0.10
  CHECK (ai_monthly_budget_eur >= 0);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id           uuid REFERENCES public.clubs(id) ON DELETE SET NULL,  -- NULL = sem clube (Liga/cron)
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  month             text NOT NULL,            -- 'YYYY-MM' (Europe/Lisbon)
  feature           text NOT NULL DEFAULT 'geral',
  model             text NOT NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  cache_hit_tokens  integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_eur          numeric(12,6) NOT NULL DEFAULT 0,
  ok                boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_club_month_idx ON public.ai_usage (club_id, month);
CREATE INDEX IF NOT EXISTS ai_usage_month_idx ON public.ai_usage (month);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;
DROP POLICY IF EXISTS ai_usage_master_select ON public.ai_usage;
CREATE POLICY ai_usage_master_select ON public.ai_usage FOR SELECT TO authenticated USING (public.is_master_admin());
