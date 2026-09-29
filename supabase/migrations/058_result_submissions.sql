-- 058_result_submissions.sql
-- Submissões públicas de resultados (pendentes de aprovação pelo admin)
-- Qualquer pessoa pode submeter; apenas admins podem aprovar/rejeitar
-- Idempotente

CREATE TABLE IF NOT EXISTS public.result_submissions (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  competition_id        UUID         REFERENCES public.competitions(id) ON DELETE SET NULL,
  home_team_name        VARCHAR(200) NOT NULL,
  away_team_name        VARCHAR(200) NOT NULL,
  home_score            INT          NOT NULL CHECK (home_score >= 0),
  away_score            INT          NOT NULL CHECK (away_score >= 0),
  submitted_by_name     VARCHAR(200) NOT NULL,
  submitted_by_team     VARCHAR(200),
  submitted_by_contact  TEXT,
  notes                 TEXT,
  submitted_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  status                VARCHAR(20)  NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason      TEXT,
  ip_hash               TEXT   -- hash do IP para rate limiting / detecção de duplicados
);

CREATE INDEX IF NOT EXISTS rs_event_id_idx     ON public.result_submissions(event_id);
CREATE INDEX IF NOT EXISTS rs_status_idx       ON public.result_submissions(status);
CREATE INDEX IF NOT EXISTS rs_submitted_at_idx ON public.result_submissions(submitted_at DESC);

-- RLS
ALTER TABLE public.result_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anon e autenticados podem submeter (INSERT) com status='pending'
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'result_submissions' AND policyname = 'p1_rs_insert_public'
  ) THEN
    CREATE POLICY "p1_rs_insert_public" ON public.result_submissions
      FOR INSERT TO anon, authenticated
      WITH CHECK (status = 'pending');
  END IF;

  -- Apenas admins podem ler e alterar (aprovação/rejeição via service role no API)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'result_submissions' AND policyname = 'p1_rs_all_admin'
  ) THEN
    CREATE POLICY "p1_rs_all_admin" ON public.result_submissions
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;
