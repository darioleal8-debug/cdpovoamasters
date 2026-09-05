-- 029: Adicionar seccionista ao role e coluna roles_extra

-- 1. Atualizar constraint de role para incluir seccionista
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

DO $$
BEGIN
  -- Converter valores inválidos se existirem (salvaguarda)
  UPDATE users SET role = 'jogador' WHERE role NOT IN ('admin','treinador','jogador','seccionista');
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'treinador', 'jogador', 'seccionista'));

-- 2. Adicionar coluna roles_extra (array de papéis acumulados, ex: ["player"])
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'roles_extra'
  ) THEN
    ALTER TABLE users
      ADD COLUMN roles_extra jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Índice para queries rápidas por roles_extra
CREATE INDEX IF NOT EXISTS users_roles_extra_gin_idx ON users USING gin(roles_extra);
