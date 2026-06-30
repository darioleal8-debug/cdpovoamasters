-- =========================================================
-- MIGRAÇÃO 011: Tabela users (roles) + user_id em players
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- ── 1. Tabela de utilizadores da aplicação ───────────────
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        UNIQUE NOT NULL,
  name       TEXT        NOT NULL DEFAULT '',
  role       TEXT        NOT NULL DEFAULT 'jogador'
             CHECK (role IN ('admin', 'treinador', 'jogador')),
  phone      TEXT,
  photo_url  TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON public.users (role);

-- ── 2. Ligar players ao auth.users (opcional) ────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players (user_id);

-- ── 3. RLS em public.users ────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_select"  ON public.users;
DROP POLICY IF EXISTS "users_own_update"  ON public.users;
DROP POLICY IF EXISTS "users_admin_all"   ON public.users;

-- Cada utilizador vê o seu próprio registo
CREATE POLICY "users_own_select" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Cada utilizador pode editar o seu próprio registo
-- (role só pode ser alterado via service role / admin)
CREATE POLICY "users_own_update" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 4. Trigger updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Criar registo admin para o utilizador existente ───
-- Substitui o email pelo do administrador real
INSERT INTO public.users (id, email, name, role)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  'admin'
FROM auth.users
WHERE email = 'darioleal8@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'admin', email = EXCLUDED.email, name = EXCLUDED.name;

-- =========================================================
-- Verificação:
-- SELECT * FROM public.users;
-- SELECT id, name, user_id FROM public.players WHERE user_id IS NOT NULL;
-- =========================================================
