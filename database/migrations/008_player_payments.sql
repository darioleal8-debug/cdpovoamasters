-- =========================================================
-- MIGRAÇÃO 008: Pagamentos avançados por jogador (plantel)
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- ── Tabela de pagamentos ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_payments (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      UUID         NOT NULL REFERENCES public.seasons(id)  ON DELETE CASCADE,
  player_id      UUID         NOT NULL REFERENCES public.players(id)  ON DELETE CASCADE,
  month          INT          NOT NULL CHECK (month BETWEEN 1 AND 12),
  reference_year INT          NOT NULL,
  amount         NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  amount_due     NUMERIC(8,2) NOT NULL DEFAULT 20.00 CHECK (amount_due >= 0),
  status         TEXT         NOT NULL DEFAULT 'late'
                              CHECK (status IN ('paid','partial','late','exempt')),
  method         TEXT         CHECK (method IN ('mbway','transferencia','numerario','cheque','outro')),
  notes          TEXT,
  payment_date   DATE,
  created_by     UUID         REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_player_month UNIQUE (season_id, player_id, month, reference_year)
);

-- ── Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pp_season   ON public.player_payments (season_id);
CREATE INDEX IF NOT EXISTS idx_pp_player   ON public.player_payments (player_id);
CREATE INDEX IF NOT EXISTS idx_pp_month    ON public.player_payments (season_id, month, reference_year);
CREATE INDEX IF NOT EXISTS idx_pp_status   ON public.player_payments (season_id, status);

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE public.player_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_select" ON public.player_payments;
DROP POLICY IF EXISTS "pp_all"    ON public.player_payments;

CREATE POLICY "pp_select" ON public.player_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "pp_all"    ON public.player_payments FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ── View de resumo por jogador/temporada ──────────────────
CREATE OR REPLACE VIEW public.player_payment_summary AS
SELECT
  pp.player_id,
  pp.season_id,
  COUNT(*)                                                        AS total_months,
  COUNT(*) FILTER (WHERE pp.status = 'paid')                     AS months_paid,
  COUNT(*) FILTER (WHERE pp.status = 'partial')                  AS months_partial,
  COUNT(*) FILTER (WHERE pp.status = 'late')                     AS months_late,
  COUNT(*) FILTER (WHERE pp.status = 'exempt')                   AS months_exempt,
  COALESCE(SUM(pp.amount),      0)                               AS total_paid,
  COALESCE(SUM(pp.amount_due),  0)                               AS total_due,
  COALESCE(SUM(pp.amount_due - pp.amount) FILTER (WHERE pp.status IN ('late','partial')), 0) AS total_missing,
  ROUND(
    COALESCE(SUM(pp.amount), 0) /
    NULLIF(COALESCE(SUM(pp.amount_due), 0), 0) * 100, 1
  )                                                               AS compliance_pct
FROM public.player_payments pp
GROUP BY pp.player_id, pp.season_id;

-- ── Trigger: updated_at automático ───────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pp_updated_at ON public.player_payments;
CREATE TRIGGER trg_pp_updated_at
  BEFORE UPDATE ON public.player_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Verificação:
-- SELECT * FROM public.player_payments LIMIT 5;
-- SELECT * FROM public.player_payment_summary LIMIT 5;
-- =========================================================
