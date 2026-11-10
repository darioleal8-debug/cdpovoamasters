-- Notificações push da app Liga INATEL (PWA instalada).
-- Subscrições anónimas (sem login) + registo de envios para garantir "uma vez por evento".
-- Acesso só via service role (APIs do servidor): RLS ligada e sem políticas.

CREATE TABLE IF NOT EXISTS public.liga_push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.liga_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.liga_push_log (
  key         text PRIMARY KEY,           -- ex.: kickoff:<evento>:<data>T<hora>, result:<jogo>, round:<n>
  kind        text NOT NULL CHECK (kind IN ('kickoff','result','round')),
  title       text,
  body        text,
  url         text,
  sent        integer NOT NULL DEFAULT 0,
  removed     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.liga_push_log ENABLE ROW LEVEL SECURITY;
