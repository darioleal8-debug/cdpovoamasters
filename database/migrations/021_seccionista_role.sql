-- =========================================================
-- MIGRAÇÃO 021: Adicionar role 'seccionista' ao tipo ENUM
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- Adiciona o valor ao ENUM user_role (idempotente: IF NOT EXISTS)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'seccionista';

-- =========================================================
-- Verificação:
-- SELECT enum_range(NULL::public.user_role);
-- =========================================================
