-- =========================================================
-- MIGRAÇÃO 012: Adicionar phone + birth_date a users e players
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
--
-- Esta migração usa ADD COLUMN IF NOT EXISTS pelo que é
-- segura de correr mesmo que a tabela já exista.
-- =========================================================

-- ── 1. Colunas em falta na tabela public.users ────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS photo_url  TEXT,
  ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT true;

-- ── 2. Colunas em falta na tabela public.players ──────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS phone      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- ── 3. Forçar Supabase a recarregar o schema cache ────────
-- (equivalente a clicar "Reload schema" em Settings → API)
NOTIFY pgrst, 'reload schema';

-- =========================================================
-- Se o NOTIFY não funcionar no teu plano, vai a:
-- Supabase → Settings → API → "Reload schema"
-- =========================================================
-- Verificação:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'users' AND table_schema = 'public';
-- =========================================================
