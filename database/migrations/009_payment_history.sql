-- =========================================================
-- MIGRAÇÃO 009: Histórico de alterações de pagamentos
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

CREATE TABLE IF NOT EXISTS public.player_payments_history (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       UUID         NOT NULL REFERENCES public.player_payments(id) ON DELETE CASCADE,
  changed_by       UUID         REFERENCES auth.users(id),
  -- Campos antes
  old_amount       NUMERIC(8,2),
  old_amount_due   NUMERIC(8,2),
  old_status       TEXT,
  old_method       TEXT,
  old_notes        TEXT,
  old_payment_date DATE,
  -- Campos depois
  new_amount       NUMERIC(8,2),
  new_amount_due   NUMERIC(8,2),
  new_status       TEXT,
  new_method       TEXT,
  new_notes        TEXT,
  new_payment_date DATE,
  -- Quando
  changed_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pph_payment ON public.player_payments_history (payment_id);
CREATE INDEX IF NOT EXISTS idx_pph_date    ON public.player_payments_history (changed_at DESC);

ALTER TABLE public.player_payments_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pph_select" ON public.player_payments_history;
CREATE POLICY "pph_select" ON public.player_payments_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pph_insert" ON public.player_payments_history;
CREATE POLICY "pph_insert" ON public.player_payments_history FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================================
-- Verificação:
-- SELECT * FROM public.player_payments_history LIMIT 5;
-- =========================================================
