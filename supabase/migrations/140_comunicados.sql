-- 140_comunicados.sql
-- Comunicados do clube: substituem o chat interno.
--
--  * announcements        — comunicados (só admin/treinador publicam, via API com service role).
--                           Podem ser soltos ou afetos a UM jogo (event_id) ou UM treino (training_id).
--  * announcement_reads   — quem já viu cada comunicado (badge de "por ler" no menu).
--  * push_subscriptions   — subscrições Web Push dos utilizadores com sessão (notificação de novos comunicados).
--
-- As tabelas do chat (chats, chat_messages, chat_participants) NÃO são alteradas nem apagadas:
-- ficam só de arquivo. Em produção só tinham 3 mensagens de teste no canal de comunicados.
--
-- Acesso:
--  * leitura direta (browser) só para membros ativos do clube (my_club_ids());
--  * escrita só pelas rotas /api/announcements com service role (a matriz de papéis valida-se lá);
--  * announcement_reads / push_subscriptions: RLS ligada, sem políticas de escrita.

-- ─── 1. Comunicados ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  author_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title         text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body          text NOT NULL CHECK (char_length(btrim(body))  BETWEEN 1 AND 4000),
  -- Afeto a um jogo OU a um treino (nunca aos dois). Se o evento for apagado, o comunicado vai com ele.
  event_id      uuid REFERENCES public.events(id)    ON DELETE CASCADE,
  training_id   uuid REFERENCES public.trainings(id) ON DELETE CASCADE,
  -- Resultado do envio das notificações push (diagnóstico; o envio é "melhor esforço")
  push_sent     integer,
  push_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT announcements_single_target CHECK (event_id IS NULL OR training_id IS NULL)
);

CREATE INDEX IF NOT EXISTS announcements_club_created_idx
  ON public.announcements (club_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS announcements_event_idx
  ON public.announcements (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS announcements_training_idx
  ON public.announcements (training_id) WHERE training_id IS NOT NULL;

DROP TRIGGER IF EXISTS announcements_set_updated_at ON public.announcements;
CREATE TRIGGER announcements_set_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select_members ON public.announcements;
CREATE POLICY announcements_select_members ON public.announcements
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND club_id = ANY (public.my_club_ids()));

REVOKE INSERT, UPDATE, DELETE ON public.announcements FROM anon, authenticated;

-- ─── 2. Leituras ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_reads_user_idx ON public.announcement_reads (user_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_reads_select_own ON public.announcement_reads;
CREATE POLICY announcement_reads_select_own ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.announcement_reads FROM anon, authenticated;

-- ─── 3. Subscrições push (utilizadores com sessão) ────────────────────────────
-- Distinta de liga_push_subscriptions (anónimas, app da Liga). Acesso só via service role.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
