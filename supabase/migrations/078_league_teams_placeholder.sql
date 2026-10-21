-- Migration 078: campo is_placeholder em league_teams
--
-- Adiciona is_placeholder BOOLEAN à tabela league_teams para distinguir
-- equipas reais de marcadores de fases seguintes (ex: "Vencedor Jogo 1").
-- Substitui filtragem por texto (name LIKE 'Vencedor Jogo%') por campo tipado,
-- o que funciona também com outros padrões de marcador futuros.

ALTER TABLE public.league_teams
  ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT false;

-- Marcar os 10 marcadores existentes
UPDATE public.league_teams
SET is_placeholder = true
WHERE name ~ '^Vencedor Jogo [0-9]+$';
