-- =========================================================
-- MIGRAÇÃO 019: Permissão de escrita por conversa (chat)
-- Permite ao admin marcar uma conversa de grupo/equipa como
-- "só leitura" (apenas admin escreve) ou "discussão" (todos
-- escrevem). Comunicados mantém-se sempre só-leitura.
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS post_policy TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
  ALTER TABLE public.chats
    ADD CONSTRAINT chats_post_policy_check CHECK (post_policy IN ('all','admin_only'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.chats SET post_policy = 'admin_only' WHERE type = 'announcement';

NOTIFY pgrst, 'reload schema';
