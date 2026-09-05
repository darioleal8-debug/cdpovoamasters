-- =========================================================
-- MIGRAÇÃO 037: Performance do chat — denormalização + índices
--
-- Problema: GET /api/chat/threads carregava chatIds×10 mensagens
-- em cada request apenas para obter a última mensagem por chat
-- e contar não-lidas. Este padrão é O(N×M) onde N = nº de chats
-- e M = mensagens recentes.
--
-- Solução:
--   1. Colunas denormalizadas na tabela chats (last_message_*)
--      mantidas em sincronia por um trigger AFTER INSERT.
--   2. Índice otimizado para o padrão de query mais frequente:
--      mensagens por chat, mais recentes primeiro, excluindo hidden.
--   3. Índice parcial para contagem de não-lidas (exclui sistema).
--
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- ── 1. Colunas denormalizadas em chats ─────────────────────

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS last_message_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_text  TEXT,
  ADD COLUMN IF NOT EXISTS last_message_sys   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_message_card  TEXT;

-- ── 2. Backfill a partir das mensagens existentes ──────────

UPDATE public.chats c
SET
  last_message_at   = sub.created_at,
  last_message_text = sub.content,
  last_message_sys  = COALESCE(sub.is_system, false),
  last_message_card = sub.card_type
FROM (
  SELECT DISTINCT ON (chat_id)
    chat_id, content, created_at, is_system, card_type
  FROM public.chat_messages
  WHERE hidden_at IS NULL
  ORDER BY chat_id, created_at DESC
) sub
WHERE c.id = sub.chat_id;

-- Sincronizar updated_at com last_message_at onde aplicável
UPDATE public.chats
SET updated_at = last_message_at
WHERE last_message_at IS NOT NULL
  AND (updated_at IS NULL OR last_message_at > updated_at);

-- ── 3. Trigger para manter colunas atualizadas ─────────────

CREATE OR REPLACE FUNCTION public.chat_sync_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Só atualiza se esta mensagem for mais recente (evita race com
  -- inserções concorrentes que cheguem fora de ordem).
  UPDATE public.chats
  SET
    last_message_at   = NEW.created_at,
    last_message_text = NEW.content,
    last_message_sys  = COALESCE(NEW.is_system, false),
    last_message_card = NEW.card_type,
    updated_at        = NEW.created_at
  WHERE id = NEW.chat_id
    AND (last_message_at IS NULL OR NEW.created_at >= last_message_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_sync_last_message ON public.chat_messages;
CREATE TRIGGER trg_chat_sync_last_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_sync_last_message();

-- ── 4. Índices de performance ──────────────────────────────

-- Padrão principal: mensagens de um chat ordenadas DESC (página de mensagens)
-- Substitui o índice sem DESC e sem condição parcial da migração 018.
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created_desc
  ON public.chat_messages (chat_id, created_at DESC)
  WHERE hidden_at IS NULL;

-- Contagem de não-lidas: exclui sistema e hidden por definição
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON public.chat_messages (chat_id, created_at, sender_id)
  WHERE hidden_at IS NULL AND is_system IS NOT TRUE;

-- Participação por utilizador (lookup de chats do user)
-- Já existe chat_participants_user_id_idx(user_id) da migração 018;
-- este cobre também chat_id no mesmo índice para evitar heap fetch.
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_chat
  ON public.chat_participants (user_id, chat_id);

NOTIFY pgrst, 'reload schema';
