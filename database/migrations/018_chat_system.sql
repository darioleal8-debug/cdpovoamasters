-- =========================================================
-- MIGRAÇÃO 018: Sistema de chat interno (Fase 1)
-- DMs, grupos, chat de equipa automático, canal de Comunicados.
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
--
-- NOTA DE SEGURANÇA: pode existir uma tabela legada
-- public.chat_messages (author_id, content, created_at) de um
-- backend Express não usado. Esta migração NÃO assume que a
-- tabela não existe — usa CREATE TABLE IF NOT EXISTS + ADD
-- COLUMN IF NOT EXISTS para convergir para o novo formato sem
-- nenhum DROP destrutivo.
-- =========================================================

-- ── 1. Tabela chats ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.chats
    ADD CONSTRAINT chats_type_check CHECK (type IN ('direct','group','team','announcement'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Apenas um chat 'announcement' (global) e um chat 'team' por season
CREATE UNIQUE INDEX IF NOT EXISTS chats_announcement_singleton_idx
  ON public.chats (type) WHERE type = 'announcement';
CREATE UNIQUE INDEX IF NOT EXISTS chats_team_per_season_idx
  ON public.chats (season_id) WHERE type = 'team';

-- ── 2. Tabela chat_participants ───────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_participants (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role_in_chat TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.chat_participants
    ADD CONSTRAINT chat_participants_role_check CHECK (role_in_chat IN ('member','admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.chat_participants
    ADD CONSTRAINT chat_participants_unique UNIQUE (chat_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS chat_participants_user_id_idx ON public.chat_participants (user_id);
CREATE INDEX IF NOT EXISTS chat_participants_chat_id_idx ON public.chat_participants (chat_id);

-- ── 3. Tabela chat_messages (defensiva — ver nota acima) ──
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS chat_id        UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sender_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content        TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- A tabela legada (ver nota no topo do ficheiro) tem uma coluna
-- author_id NOT NULL que o backend Express antigo preenchia; a app
-- atual usa sender_id e nunca a preenche, por isso a inserção falhava
-- com "null value in column author_id violates not-null constraint".
-- Relaxa a constraint sem apagar a coluna (não-destrutivo).
DO $$
BEGIN
  ALTER TABLE public.chat_messages ALTER COLUMN author_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS chat_messages_chat_id_created_at_idx
  ON public.chat_messages (chat_id, created_at);

-- ── 4. RLS ─────────────────────────────────────────────────
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chats_select ON public.chats;
CREATE POLICY chats_select ON public.chats FOR SELECT
  USING (
    type = 'announcement'
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = chats.id AND cp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS chats_insert ON public.chats;
CREATE POLICY chats_insert ON public.chats FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
  -- Validação fina da matriz de permissões acontece nas rotas de API
  -- (que escrevem via service role); esta policy só cobre o caminho
  -- teórico de um insert direto a partir do browser client.

DROP POLICY IF EXISTS chat_participants_select ON public.chat_participants;
CREATE POLICY chat_participants_select ON public.chat_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp2
      WHERE cp2.chat_id = chat_participants.chat_id AND cp2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_participants_insert ON public.chat_participants;
CREATE POLICY chat_participants_insert ON public.chat_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chats c WHERE c.id = chat_messages.chat_id AND c.type = 'announcement'
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_messages.chat_id AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
  -- Escrita real acontece via service role nas rotas de API (que validam a
  -- matriz de permissões); esta policy só cobre o caminho teórico
  -- browser → BD direto.

-- ── 5. Realtime publication ───────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
