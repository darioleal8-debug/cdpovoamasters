-- 142 — Quota mensal editável por clube
-- Até aqui a quota mensal (20 €) estava fixa no código. Passa a ser uma definição do clube
-- (club_settings.monthly_fee), por defeito 10 €/mês, que o administrador pode alterar a qualquer
-- momento em Pagamentos. Só afeta meses sem registo: os pagamentos já registados mantêm o seu valor.

ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(8,2) NOT NULL DEFAULT 10
  CHECK (monthly_fee >= 0 AND monthly_fee <= 1000);

ALTER TABLE public.player_payments ALTER COLUMN amount_due SET DEFAULT 10.00;
