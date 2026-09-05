-- Migration 041: Remover colunas redundantes de players.
--
-- players.name  → usar users.name  (via JOIN ou v_roster)
-- players.email → usar users.email (via JOIN ou v_roster)
--
-- PRÉ-REQUISITOS:
--   1. Migration 040 aplicada com sucesso.
--   2. Migration 042 aplicada (v_roster disponível para o frontend).
--   3. Frontend actualizado para usar v_roster / JOIN em vez de players directo.
--   4. API routes actualizadas para não escrever name/email em players.
--
-- ⚠️  IRREVERSÍVEL — confirmar antes de correr em produção.
-- Verificação: SELECT name, email FROM players LIMIT 5; → último olhar antes de apagar.

ALTER TABLE public.players
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS email;

NOTIFY pgrst, 'reload schema';
