-- ── 035 — Pedidos de acesso ao hoophub ──────────────────────────────────────
-- Utilizadores externos pedem acesso via /pedir-acesso (sem auto-registo).
-- O administrador revê na lista pendente e aceita / recusa.

CREATE TABLE IF NOT EXISTS public.access_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name     TEXT        NOT NULL,
  city          TEXT        NOT NULL,
  category      TEXT        NOT NULL,   -- '+40', '+50', 'outro'
  league        TEXT        NOT NULL,
  player_count  INT         NOT NULL CHECK (player_count > 0),
  contact_name  TEXT        NOT NULL,
  contact_role  TEXT        NOT NULL,   -- 'dirigente', 'treinador', 'jogador-organizador'
  email         TEXT        NOT NULL,
  phone         TEXT,
  status        TEXT        NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente','aceite','recusado')),
  ip_hash       TEXT,        -- SHA-256 do IP — para rate-limit sem guardar IP
  honeypot      TEXT,        -- campo oculto; se preenchido é spam
  notes         TEXT,        -- notas internas do admin
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Visibilidade pública por clube (opt-in; false por defeito)
ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Rate-limit: max 3 pedidos por IP nas últimas 24 h (verificado na app)
CREATE INDEX IF NOT EXISTS access_requests_ip_hash_created_idx
  ON public.access_requests (ip_hash, created_at);

CREATE INDEX IF NOT EXISTS access_requests_status_idx
  ON public.access_requests (status) WHERE status = 'pendente';

-- RLS: só admins lêem; ninguém pode ler/alterar via RLS (app usa service_role)
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ler pedidos de acesso"
  ON public.access_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'treinador')
    )
  );

-- Inserção é feita via API route com service_role (sem política permissiva pública)
