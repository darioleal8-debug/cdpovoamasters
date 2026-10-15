-- Migration: 063_fix_rsvp_rls
-- Raiz do problema: a migração rls_hardening (20260919) fez DROP de TODAS as
-- políticas RLS existentes (STEP 4) mas só recriou políticas para as tabelas
-- que já conhecia. As tabelas criadas em migrações posteriores (055-059) e
-- game_availability ficaram com RLS ATIVO mas SEM políticas → operações bloqueadas.
--
-- Esta migração:
--   1. Recria as políticas de training_rsvps (SELECT agora abre a todos os autenticados).
--   2. Cria políticas de game_availability (confirmações de disponibilidade para jogos).
--   3. Recria políticas de competitions, league_game_results, result_submissions,
--      user_activity_logs (migr. 056-059) — funcionalidades silenciosamente quebradas.
--
-- Segurança:
--   • Todas as operações de escrita continuam a exigir identidade verificada.
--   • Nenhuma tabela abre acesso anónimo (rls_hardening já revogou anon; AdminClient
--     é usado em todas as rotas públicas).

-- ────────────────────────────────────────────────────────────────────
-- 1. training_rsvps
-- ────────────────────────────────────────────────────────────────────

-- SELECT: qualquer utilizador autenticado pode ver quem se disponibilizou
-- (alteração deliberada face ao original: antes era só própria linha ou treinador+)
DROP POLICY IF EXISTS "p1_rsvps_select" ON public.training_rsvps;
CREATE POLICY "p1_rsvps_select" ON public.training_rsvps
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- INSERT: própria linha (jogador) ou qualquer linha (treinador+)
DROP POLICY IF EXISTS "p1_rsvps_insert" ON public.training_rsvps;
CREATE POLICY "p1_rsvps_insert" ON public.training_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- UPDATE: própria linha (jogador) ou qualquer linha (treinador+)
DROP POLICY IF EXISTS "p1_rsvps_update" ON public.training_rsvps;
CREATE POLICY "p1_rsvps_update" ON public.training_rsvps
  FOR UPDATE TO authenticated
  USING (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- DELETE: só treinador+
DROP POLICY IF EXISTS "p1_rsvps_delete" ON public.training_rsvps;
CREATE POLICY "p1_rsvps_delete" ON public.training_rsvps
  FOR DELETE TO authenticated
  USING ((SELECT public.is_trainer_or_above()));

-- ────────────────────────────────────────────────────────────────────
-- 2. game_availability
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.game_availability ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer utilizador autenticado
DROP POLICY IF EXISTS "p1_game_availability_select" ON public.game_availability;
CREATE POLICY "p1_game_availability_select" ON public.game_availability
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- INSERT: própria linha (jogador) ou treinador+
DROP POLICY IF EXISTS "p1_game_availability_insert" ON public.game_availability;
CREATE POLICY "p1_game_availability_insert" ON public.game_availability
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- UPDATE: própria linha (jogador) ou treinador+
DROP POLICY IF EXISTS "p1_game_availability_update" ON public.game_availability;
CREATE POLICY "p1_game_availability_update" ON public.game_availability
  FOR UPDATE TO authenticated
  USING (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- DELETE: só treinador+
DROP POLICY IF EXISTS "p1_game_availability_delete" ON public.game_availability;
CREATE POLICY "p1_game_availability_delete" ON public.game_availability
  FOR DELETE TO authenticated
  USING ((SELECT public.is_trainer_or_above()));

-- ────────────────────────────────────────────────────────────────────
-- 3. competitions  (migr. 056)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p1_competitions_select_public" ON public.competitions;
CREATE POLICY "p1_competitions_select_public" ON public.competitions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "p1_competitions_write_admin" ON public.competitions;
CREATE POLICY "p1_competitions_write_admin" ON public.competitions
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ────────────────────────────────────────────────────────────────────
-- 4. league_game_results  (migr. 057)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.league_game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p1_lgr_select_public" ON public.league_game_results;
CREATE POLICY "p1_lgr_select_public" ON public.league_game_results
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "p1_lgr_write_admin" ON public.league_game_results;
CREATE POLICY "p1_lgr_write_admin" ON public.league_game_results
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ────────────────────────────────────────────────────────────────────
-- 5. result_submissions  (migr. 058)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.result_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p1_rs_insert_public" ON public.result_submissions;
CREATE POLICY "p1_rs_insert_public" ON public.result_submissions
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "p1_rs_all_admin" ON public.result_submissions;
CREATE POLICY "p1_rs_all_admin" ON public.result_submissions
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ────────────────────────────────────────────────────────────────────
-- 6. user_activity_logs  (migr. 059)
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ual_insert_own" ON public.user_activity_logs;
CREATE POLICY "ual_insert_own" ON public.user_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "ual_select_staff" ON public.user_activity_logs;
CREATE POLICY "ual_select_staff" ON public.user_activity_logs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_trainer_or_above()));
