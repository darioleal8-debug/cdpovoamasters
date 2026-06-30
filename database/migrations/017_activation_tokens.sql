-- =========================================================
-- MIGRAÇÃO 017: Tokens de ativação de conta
-- =========================================================
-- Cria a tabela user_activation_tokens para o fluxo de
-- ativação de contas de jogadores por email.
-- O campo `active` em public.users já existe (migration 012).
-- Novas contas de jogadores são criadas com active = false.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.user_activation_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  used        BOOLEAN     NOT NULL DEFAULT false,
  used_at     TIMESTAMPTZ,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para lookup eficiente
CREATE INDEX IF NOT EXISTS idx_act_token  ON public.user_activation_tokens (token);
CREATE INDEX IF NOT EXISTS idx_act_user   ON public.user_activation_tokens (user_id, used);
CREATE INDEX IF NOT EXISTS idx_act_expiry ON public.user_activation_tokens (expires_at) WHERE used = false;

-- RLS: só o service role acede (sem políticas para anon/authenticated)
ALTER TABLE public.user_activation_tokens ENABLE ROW LEVEL SECURITY;

-- Recarregar schema cache
NOTIFY pgrst, 'reload schema';

-- =========================================================
-- ESTADO FINAL:
-- • Contas jogador criadas via API → active = false
-- • Token gerado (64 chars hex, TTL 24h) guardado aqui
-- • Email enviado com link /activate?token=<token>
-- • Ativação: token validado → active = true, used = true
-- =========================================================
