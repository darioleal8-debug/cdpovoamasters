-- =========================================================
-- MIGRAÇÃO 033: Fios de eventos no chat
-- Adiciona suporte a threads de jogo/treino, cartões estruturados
-- e marcações de leitura por mensagem.
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- ── 1. Estender tabela chats ───────────────────────────────

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS event_id    UUID REFERENCES public.events(id)   ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS training_id UUID REFERENCES public.trainings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active';

-- Atualizar constraint de tipo para incluir 'event'
DO $$
BEGIN
  ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_type_check;
  ALTER TABLE public.chats
    ADD CONSTRAINT chats_type_check
    CHECK (type IN ('direct','group','team','announcement','event'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Um fio por evento e por treino
CREATE UNIQUE INDEX IF NOT EXISTS chats_event_id_idx
  ON public.chats (event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chats_training_id_idx
  ON public.chats (training_id) WHERE training_id IS NOT NULL;

-- ── 2. Estender tabela chat_messages ──────────────────────

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS card_type TEXT,
  ADD COLUMN IF NOT EXISTS card_data JSONB,
  ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_role TEXT;

DO $$
BEGIN
  ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_card_type_check
    CHECK (card_type IN ('callup_response','poll','transport','attendance','quota_reminder'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Tabela de leitura por mensagem ─────────────────────

CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_unique UNIQUE (message_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS chat_message_reads_message_idx ON public.chat_message_reads (message_id);
CREATE INDEX IF NOT EXISTS chat_message_reads_user_idx    ON public.chat_message_reads (user_id);

-- ── 4. RLS para chat_message_reads ────────────────────────

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_message_reads_select ON public.chat_message_reads;
CREATE POLICY chat_message_reads_select ON public.chat_message_reads FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_participants cp ON cp.chat_id = cm.chat_id
      WHERE cm.id = chat_message_reads.message_id AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_message_reads_insert ON public.chat_message_reads;
CREATE POLICY chat_message_reads_insert ON public.chat_message_reads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── 5. Índices adicionais em chat_messages ─────────────────

CREATE INDEX IF NOT EXISTS chat_messages_is_system_idx
  ON public.chat_messages (chat_id, is_system) WHERE is_system = true;
CREATE INDEX IF NOT EXISTS chat_messages_hidden_idx
  ON public.chat_messages (chat_id) WHERE hidden_at IS NULL;

-- ── 6. Realtime ────────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
