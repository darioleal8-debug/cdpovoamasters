-- 102_fix_opponent_is_test.sql
-- 1. Adiciona coluna is_test a events (para marcar jogos de teste que não
--    devem ser visíveis para jogadores).
-- 2. Corrige o campo opponent em jogos do clube onde foi guardado o nosso
--    nome ("CD Póvoa") em vez do nome da equipa adversária.

BEGIN;

-- ── 1. Coluna is_test ────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.is_test IS
  'TRUE para jogos de teste criados por gestores; ocultados na vista de jogadores.';

CREATE INDEX IF NOT EXISTS events_is_test_idx
  ON public.events (is_test)
  WHERE is_test = TRUE;

-- Jogo de teste conhecido
UPDATE public.events
SET    is_test = TRUE
WHERE  id = '8a328d31-279f-48fb-9def-3475ebf02f52';

-- ── 2. Corrige campo opponent ────────────────────────────────
-- Para jogos FORA (is_home=false): opponent deve ser a equipa da casa
UPDATE public.events
SET    opponent = description::jsonb->>'home_team'
WHERE  type         = 'jogo'
  AND  is_club_game = TRUE
  AND  deleted_at   IS NULL
  AND  description  IS NOT NULL
  AND  description::jsonb ? 'is_home'
  AND  description::jsonb ? 'home_team'
  AND (description::jsonb->>'is_home')::boolean = FALSE
  AND (
    opponent ILIKE '%Póvoa%'
    OR opponent IS NULL
    OR trim(opponent) = ''
  );

-- Para jogos EM CASA (is_home=true): opponent deve ser a equipa visitante
UPDATE public.events
SET    opponent = description::jsonb->>'away_team'
WHERE  type         = 'jogo'
  AND  is_club_game = TRUE
  AND  deleted_at   IS NULL
  AND  description  IS NOT NULL
  AND  description::jsonb ? 'is_home'
  AND  description::jsonb ? 'away_team'
  AND (description::jsonb->>'is_home')::boolean = TRUE
  AND (
    opponent ILIKE '%Póvoa%'
    OR opponent IS NULL
    OR trim(opponent) = ''
  );

COMMIT;
