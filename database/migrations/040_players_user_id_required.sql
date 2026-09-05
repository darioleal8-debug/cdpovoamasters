-- Migration 040: Tornar players.user_id obrigatório e único por época.
--
-- PRÉ-REQUISITOS (correr ANTES desta migration):
--   1. Correr script data/B1_audit_orphans.sql e rever output.
--   2. Correr script data/B2_link_players_by_email.sql.
--   3. Correr script data/B3_create_missing_players.sql.
--   4. Verificar: SELECT COUNT(*) FROM players WHERE user_id IS NULL; → deve ser 0.
--
-- Verificação de segurança — esta query deve devolver 0 antes de continuar:
-- SELECT COUNT(*) FROM public.players WHERE user_id IS NULL;

-- Adicionar UNIQUE: um utilizador só pode ter um perfil por época
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'players_user_season_unique'
      AND conrelid = 'public.players'::regclass
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_user_season_unique UNIQUE (user_id, season_id);
  END IF;
END $$;

-- Tornar user_id NOT NULL (falha se ainda existirem NULLs — intencional)
ALTER TABLE public.players
  ALTER COLUMN user_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';
