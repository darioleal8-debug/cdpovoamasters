-- Migration 039: Corrigir sistema de roles e garantir roles_extra consistente.
--
-- Contexto real descoberto em auditoria:
--   users.role é do tipo ENUM public.user_role (criado na migration 021),
--   não um TEXT com CHECK como indicava a migration 011.
--   'tesoureiro' nunca foi adicionado ao ENUM — inserções com esse role falhavam.
--
-- Correções:
--   1. Adicionar 'tesoureiro' ao ENUM user_role.
--   2. Garantir roles_extra nunca é NULL (o código espera sempre um array).
--   3. Corrigir valores legados: "player" é inválido; o valor correcto é "jogador".

-- 1. Adicionar 'tesoureiro' ao ENUM (IF NOT EXISTS disponível desde Postgres 9.3)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'tesoureiro';

-- 2. Garantir roles_extra nunca é NULL
UPDATE public.users SET roles_extra = '[]'::jsonb WHERE roles_extra IS NULL;

ALTER TABLE public.users
  ALTER COLUMN roles_extra SET DEFAULT '[]'::jsonb,
  ALTER COLUMN roles_extra SET NOT NULL;

-- 3. Corrigir valores legados: "player" → "jogador"
UPDATE public.users
SET roles_extra = (
  SELECT jsonb_agg(
    CASE WHEN v::text = '"player"' THEN '"jogador"'::jsonb ELSE v END
  )
  FROM jsonb_array_elements(roles_extra) AS v
)
WHERE roles_extra @> '["player"]'::jsonb;

NOTIFY pgrst, 'reload schema';
