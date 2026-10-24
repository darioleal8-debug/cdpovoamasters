-- 094_league_teams_kit.sql
-- Cores do equipamento e descrição do kit para geração de imagens IA coerentes

ALTER TABLE public.league_teams
  ADD COLUMN IF NOT EXISTS primary_color   VARCHAR(20),   -- cor primária hex, ex: "#E63946"
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20),   -- cor secundária hex, ex: "#FFFFFF"
  ADD COLUMN IF NOT EXISTS kit_description TEXT;          -- ex: "Camisola vermelha com número e faixa branca"
