-- Migration 043: Remover constraint CHECK redundante em users.role
--
-- Contexto:
--   migration 011 criou users.role como TEXT com CHECK (role IN ('admin','treinador','jogador')).
--   migration 021 converteu role para ENUM public.user_role — o ENUM já impõe valores válidos.
--   migration 029 atualizou o CHECK para incluir 'seccionista' (ainda como TEXT CHECK).
--   migration 039 adicionou 'tesoureiro' ao ENUM mas NÃO atualizou o CHECK de 029.
--   Resultado: qualquer UPDATE numa linha com role='tesoureiro' falha o CHECK de 029
--   (mesmo que só esteja a alterar active, updated_at, etc.).
--
-- Correção: remover o CHECK — o ENUM já garante consistência dos valores.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
