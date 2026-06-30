-- =========================================================
-- MIGRAÇÃO 013: Adicionar weight + garantir user_id em players
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- weight (kg) para o perfil desportivo
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS weight NUMERIC(5,2);

-- user_id (caso a migração 011 não tenha sido aplicada)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Recarregar schema cache
NOTIFY pgrst, 'reload schema';

-- =========================================================
-- Verificação:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'players' AND table_schema = 'public';
-- =========================================================
