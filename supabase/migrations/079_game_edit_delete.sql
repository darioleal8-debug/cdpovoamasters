-- Migration 079: edição e eliminação de jogos no painel super-admin
--
-- Adiciona:
--   events.original_scheduled_at  – data/hora original (antes do primeiro reagendamento)
--   events.deleted_at             – soft delete; NULL = jogo activo
--   game_audit_log                – auditoria de update/delete/restore de jogos

-- ─── 1. Colunas em events ─────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS original_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS events_deleted_at_idx ON public.events (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ─── 2. Tabela de auditoria ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action       VARCHAR(20) NOT NULL,  -- 'update' | 'delete' | 'restore'
  altered_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  before_data  JSONB,
  after_data   JSONB,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_audit_log ENABLE ROW LEVEL SECURITY;

-- Só liga_admins podem ler/escrever no log
CREATE POLICY "liga_admin_audit_log" ON public.game_audit_log
  FOR ALL TO authenticated
  USING  (public.is_liga_admin())
  WITH CHECK (public.is_liga_admin());

-- ─── 3. RLS de escrita em events (defesa em profundidade) ────────────────────
-- As rotas de API já usam service role (bypass RLS), mas estas políticas
-- impedem escrita directa via cliente autenticado sem ser liga_admin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'liga_admin_update_events'
  ) THEN
    CREATE POLICY "liga_admin_update_events" ON public.events
      FOR UPDATE TO authenticated
      USING  (public.is_liga_admin())
      WITH CHECK (public.is_liga_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'liga_admin_delete_events'
  ) THEN
    CREATE POLICY "liga_admin_delete_events" ON public.events
      FOR DELETE TO authenticated
      USING (public.is_liga_admin());
  END IF;
END
$$;
