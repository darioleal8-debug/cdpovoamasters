-- ═══════════════════════════════════════════════════════════════
-- Migração 020: segurança de notas de treino + convocatórias de jogo
-- ═══════════════════════════════════════════════════════════════
-- 1) training_notes tinha RLS totalmente aberta (FOR ALL USING(true)).
--    Passa a restringir escrita (INSERT/UPDATE/DELETE) a admin/treinador;
--    leitura mantém-se aberta a todos os autenticados.
-- 2) Nova tabela game_callups (convocatória por jogo), com a mesma
--    política: leitura aberta, escrita restrita a admin/treinador.
--    "Jogo" = linha da tabela events com type='jogo' (não existe
--    tabela games separada). "Plantel da temporada" = players.season_id
--    (não existe tabela season_players separada).

-- ─── 1. Apertar RLS de training_notes ─────────────────────────
DROP POLICY IF EXISTS "tn_select" ON public.training_notes;
DROP POLICY IF EXISTS "tn_all"    ON public.training_notes;
DROP POLICY IF EXISTS "tn_insert" ON public.training_notes;
DROP POLICY IF EXISTS "tn_update" ON public.training_notes;
DROP POLICY IF EXISTS "tn_delete" ON public.training_notes;

CREATE POLICY "tn_select" ON public.training_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tn_insert" ON public.training_notes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','treinador'))
  );

CREATE POLICY "tn_update" ON public.training_notes
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','treinador'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','treinador'))
  );

CREATE POLICY "tn_delete" ON public.training_notes
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','treinador'))
  );

-- ─── 2. Tabela game_callups (convocatórias) ───────────────────
CREATE TABLE IF NOT EXISTS public.game_callups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  player_id  UUID        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_game_callups_game_player UNIQUE (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_game_callups_game   ON public.game_callups (game_id);
CREATE INDEX IF NOT EXISTS idx_game_callups_player ON public.game_callups (player_id);

ALTER TABLE public.game_callups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_select" ON public.game_callups;
DROP POLICY IF EXISTS "gc_insert" ON public.game_callups;
DROP POLICY IF EXISTS "gc_delete" ON public.game_callups;

CREATE POLICY "gc_select" ON public.game_callups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gc_insert" ON public.game_callups
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','treinador'))
  );

CREATE POLICY "gc_delete" ON public.game_callups
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','treinador'))
  );

NOTIFY pgrst, 'reload schema';
