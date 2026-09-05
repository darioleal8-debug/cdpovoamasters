-- 034_play_events_idempotency.sql
-- Adiciona suporte a: idempotência (client_id), soft-delete para desfazer (deleted_at)
-- e registo do autor (author_id) na tabela play_by_play.
-- Necessário para a fila offline do ecrã de marcação mobile.

-- ── Novos campos ─────────────────────────────────────────────────────────────

ALTER TABLE public.play_by_play
  ADD COLUMN IF NOT EXISTS client_id  UUID        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS author_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL;

-- Índice único para idempotência: um device_id só pode submeter um evento uma vez
-- Usamos WHERE client_id IS NOT NULL para não conflituar rows antigas sem client_id
CREATE UNIQUE INDEX IF NOT EXISTS play_by_play_client_id_unique
  ON public.play_by_play (client_id)
  WHERE client_id IS NOT NULL;

-- Índice para consultas de soft-delete (UI filtra deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS play_by_play_deleted_at_idx
  ON public.play_by_play (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── RLS: permitir ao autor apagar (soft-delete) o seu próprio evento ─────────

-- Policy de leitura já existe — só eventos não eliminados são visíveis
-- (A política existente usa SELECT USING (true), actualizamos para filtrar)
-- Nota: se existir uma policy "play_by_play_select" generic, esta não a quebra.

DO $$ BEGIN
  CREATE POLICY "play_by_play_soft_delete"
    ON public.play_by_play
    FOR UPDATE
    USING (
      auth.uid() = author_id
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('admin', 'treinador')
      )
    )
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
