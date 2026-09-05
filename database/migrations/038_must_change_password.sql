-- =========================================================
-- MIGRAÇÃO 038: Flag de alteração de password obrigatória
--
-- Suporta o fluxo "password temporária → primeiro login →
-- alterar password". Quando um admin repõe a password de um
-- utilizador, esta flag fica true. No primeiro login, o sistema
-- redireciona para /alterar-password. Após alteração, fica false.
--
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
