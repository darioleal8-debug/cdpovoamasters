-- =========================================================
-- MIGRAÇÃO 014: Corrigir ON DELETE CASCADE para eliminação de contas
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- ── 1. Garantir que public.users.id tem CASCADE de auth.users ─────────────
-- A tabela existia antes de migration 011, por isso o FK pode não ter CASCADE.
-- Recria o constraint com CASCADE.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_pkey CASCADE;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Garantir que a coluna id existe como UUID FK para auth.users com CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name)
    WHERE tc.table_name = 'users' AND tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'id'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. Mudar players.user_id de SET NULL para CASCADE DELETE ───────────────
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_user_id_fkey;

ALTER TABLE public.players
  ADD CONSTRAINT players_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 3. Recarregar schema cache ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- =========================================================
-- RESULTADO:
-- • Eliminar auth user → elimina public.users (CASCADE)
-- • Eliminar auth user → elimina players onde user_id=id (CASCADE)
-- =========================================================
