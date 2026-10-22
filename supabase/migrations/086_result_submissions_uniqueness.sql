-- 086_result_submissions_uniqueness.sql
-- Bug fix: impedir mais de uma submissão pendente por jogo
--
-- Causa: submit route fazia INSERT puro sem verificar existência.
-- Fix: índice único parcial para (event_id) WHERE status = 'pending'.
-- O submit route usará upsert (ON CONFLICT ... DO UPDATE).

-- Cleanup preventivo: se houver pendentes duplicadas, guardar só a mais recente
-- (SELECT abaixo confirma que não existem — mas a migration é idempotente)
DO $$
DECLARE
  deleted_count INT;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY submitted_at DESC) AS rn
    FROM public.result_submissions
    WHERE status = 'pending'
  )
  DELETE FROM public.result_submissions
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Removidas % submissões pendentes duplicadas (mantida a mais recente por jogo).', deleted_count;
  END IF;
END $$;

-- Índice único parcial: no máximo 1 submissão pending por jogo
CREATE UNIQUE INDEX IF NOT EXISTS rs_one_pending_per_game
  ON public.result_submissions(event_id)
  WHERE status = 'pending';
