-- =========================================================
-- MIGRAÇÃO 015: Corrigir FK incorreta em public.users
--
-- PROBLEMA: A migração 014 adicionou users_id_fkey
-- (public.users.id → auth.users.id) que causou o erro:
--   "insert or update on table users violates foreign key
--    constraint users_id_fkey"
-- Também fez DROP CONSTRAINT users_pkey CASCADE que
-- removeu a chave primária de public.users.
--
-- SOLUÇÃO: Remover a FK incorreta + restaurar PK + fixar
-- a única FK necessária: players.user_id → auth.users.id
-- =========================================================

-- ── 1. Restaurar PK de public.users (se foi removida) ─────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- ── 2. Remover FK incorreta de public.users ───────────────
-- public.users NÃO deve ter FK para auth.users.
-- O backend faz a eliminação explicitamente.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- ── 3. Corrigir FK de public.players.user_id ─────────────
-- Remover qualquer FK existente (pode ter ON DELETE SET NULL)
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_user_id_fkey;

-- Re-criar com ON DELETE CASCADE para eliminar jogador
-- automaticamente quando a conta é eliminada.
ALTER TABLE public.players
  ADD CONSTRAINT players_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ── 4. Limpar jogadores com user_id inválido ──────────────
-- Remove jogadores cujo user_id não existe em auth.users.
DELETE FROM public.players
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM auth.users);

-- ── 5. Recarregar schema cache ────────────────────────────
NOTIFY pgrst, 'reload schema';

-- =========================================================
-- ESTADO FINAL:
--
-- public.users
--   • PK: id UUID (restaurada)
--   • SEM FK para auth.users (eliminação gerida pelo backend)
--
-- public.players
--   • FK players_user_id_fkey: user_id → auth.users(id)
--                              ON DELETE CASCADE
--
-- Fluxo de eliminação de conta:
--   Backend:  DELETE players WHERE user_id=X
--   Backend:  DELETE public.users WHERE id=X
--   Backend:  auth.admin.deleteUser(X)
--   DB (auto): CASCADE elimina players restantes (segurança)
-- =========================================================
