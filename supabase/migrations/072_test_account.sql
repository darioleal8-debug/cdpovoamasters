-- 072_test_account.sql
-- Adiciona campo is_test_account à tabela users e marca a conta de teste.
--
-- IMPORTANTE: Mostrar ao utilizador para revisão antes de aplicar.
-- Aplicar no Supabase SQL Editor (projeto uhszagzrhdfzpfztuati).

BEGIN;

-- ── 1. Adicionar coluna ──────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_test_account IS
  'Se true, este utilizador é uma conta de teste e deve ser excluído de '
  'contagens de plantel, pagamentos, presenças e dashboards de gestão.';

-- ── 2. Marcar a conta de teste ───────────────────────────────────────────────
-- Usa email da tabela auth.users para encontrar o UUID correcto.

UPDATE public.users u
SET is_test_account = true
FROM auth.users au
WHERE u.id = au.id
  AND au.email = 'dario.leal@outlook.pt';

DO $$
DECLARE affected int;
BEGIN
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RAISE WARNING 'Nenhum utilizador encontrado com email dario.leal@outlook.pt — verificar se a conta existe';
  ELSE
    RAISE NOTICE 'OK: % conta(s) marcada(s) como is_test_account = true', affected;
  END IF;
END $$;

-- ── 3. Índice parcial para lookups rápidos ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_is_test_account
  ON public.users (is_test_account)
  WHERE is_test_account = true;

COMMIT;
