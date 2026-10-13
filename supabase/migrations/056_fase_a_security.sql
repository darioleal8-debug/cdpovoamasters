-- =====================================================================
-- 056 — Fase A (auditoria 2026-10-13): RLS do chat, matriz de papéis,
--        enum de faltas, presenças, access_requests, email protegido.
-- IDs da auditoria: SEC-01, SEC-02, SEC-14, STA-07, PRES-01/SEC-21, SEC-20, SEC-24.
-- Idempotente: pode ser re-aplicada.
-- Matriz de papéis (decisão do dono do produto, 2026-10-13):
--   gestão desportiva = admin, treinador, seccionista  → is_manager()
--   quotas/finanças   = admin, tesoureiro               → is_finance()
--   temporadas, definições do clube, kits, templates    → is_admin()
-- Todas (incluindo is_admin/is_staff/is_trainer_or_above, redefinidas aqui) exigem conta
-- ativa (users.active) e consideram users.roles_extra.
-- =====================================================================

-- ── 1. Enum de faltas usado pelo ecrã live (STA-07) ───────────────────
ALTER TYPE public.play_event_type ADD VALUE IF NOT EXISTS 'foul_def';
ALTER TYPE public.play_event_type ADD VALUE IF NOT EXISTS 'foul_of';
ALTER TYPE public.play_event_type ADD VALUE IF NOT EXISTS 'foul_tec';
ALTER TYPE public.play_event_type ADD VALUE IF NOT EXISTS 'foul_anti';

-- ── 2. Funções de papel ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_active_role(p_roles text[])
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.active
      AND (u.role::text = ANY (p_roles) OR u.roles_extra ?| p_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.has_active_role(ARRAY['admin','treinador','seccionista'])
$$;

CREATE OR REPLACE FUNCTION public.is_finance()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.has_active_role(ARRAY['admin','tesoureiro'])
$$;

-- As funções já existentes (usadas por dezenas de políticas) passam também a exigir conta ativa
-- e a honrar roles_extra — mantendo os papéis de cada uma (revisão final, Importante 2).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.has_active_role(ARRAY['admin'])
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.has_active_role(ARRAY['admin','seccionista'])
$$;

CREATE OR REPLACE FUNCTION public.is_trainer_or_above()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.has_active_role(ARRAY['admin','seccionista','treinador'])
$$;

REVOKE ALL ON FUNCTION public.has_active_role(text[]), public.is_manager(), public.is_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_role(text[]), public.is_manager(), public.is_finance() TO authenticated;

-- ── 3. Chat: colunas qualificadas (SEC-01) ─────────────────────────────
-- Antes: `cp.chat_id = chat_id` resolvia para cp.chat_id (sempre verdade) e
-- `cp.chat_id = id` para cp.id (nunca verdade).
DROP POLICY IF EXISTS "p1_chat_messages_participant_select" ON public.chat_messages;
CREATE POLICY "p1_chat_messages_participant_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_participants cp
    WHERE cp.chat_id = chat_messages.chat_id AND cp.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "p1_chat_messages_participant_insert" ON public.chat_messages;
CREATE POLICY "p1_chat_messages_participant_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.chat_id = chat_messages.chat_id AND cp.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "p1_chats_participant" ON public.chats;
CREATE POLICY "p1_chats_participant" ON public.chats
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_participants cp
    WHERE cp.chat_id = chats.id AND cp.user_id = (SELECT auth.uid())
  ));

-- ── 4. Matriz de papéis (SEC-02, SEC-14) ───────────────────────────────
-- Gestão desportiva → is_manager()
DROP POLICY IF EXISTS "p1_events_write" ON public.events;
CREATE POLICY "p1_events_write" ON public.events FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
DROP POLICY IF EXISTS "p1_players_write" ON public.players;
CREATE POLICY "p1_players_write" ON public.players FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
DROP POLICY IF EXISTS "p1_game_callups_write" ON public.game_callups;
CREATE POLICY "p1_game_callups_write" ON public.game_callups FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
DROP POLICY IF EXISTS "p1_league_teams_write" ON public.league_teams;
CREATE POLICY "p1_league_teams_write" ON public.league_teams FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
DROP POLICY IF EXISTS "p1_calendar_imports" ON public.calendar_imports;
CREATE POLICY "p1_calendar_imports" ON public.calendar_imports FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
DROP POLICY IF EXISTS "p1_club_events_write" ON public.club_events;
CREATE POLICY "p1_club_events_write" ON public.club_events FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());

-- Quotas e finanças → is_finance()
DROP POLICY IF EXISTS "p1_player_payments_staff" ON public.player_payments;
CREATE POLICY "p1_player_payments_staff" ON public.player_payments FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());
DROP POLICY IF EXISTS "p1_player_payments_history_staff" ON public.player_payments_history;
CREATE POLICY "p1_player_payments_history_staff" ON public.player_payments_history FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());
DROP POLICY IF EXISTS "p1_payment_receipts_staff" ON public.payment_receipts;
CREATE POLICY "p1_payment_receipts_staff" ON public.payment_receipts FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());
DROP POLICY IF EXISTS "p1_payments_staff" ON public.payments;
CREATE POLICY "p1_payments_staff" ON public.payments FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());
DROP POLICY IF EXISTS "p1_financial_entries" ON public.financial_entries;
CREATE POLICY "p1_financial_entries" ON public.financial_entries FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());
DROP POLICY IF EXISTS "p1_financial_expenses" ON public.financial_expenses;
CREATE POLICY "p1_financial_expenses" ON public.financial_expenses FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());
DROP POLICY IF EXISTS "p1_financial_cash_movements" ON public.financial_cash_movements;
CREATE POLICY "p1_financial_cash_movements" ON public.financial_cash_movements FOR ALL TO authenticated USING (is_finance()) WITH CHECK (is_finance());

-- Administração → is_admin() (leitura mantém as políticas SELECT existentes)
DROP POLICY IF EXISTS "p1_seasons_write" ON public.seasons;
CREATE POLICY "p1_seasons_write" ON public.seasons FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "p1_club_settings_write" ON public.club_settings;
CREATE POLICY "p1_club_settings_write" ON public.club_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "p1_player_photo_templates" ON public.player_photo_templates;
CREATE POLICY "p1_player_photo_templates" ON public.player_photo_templates FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "p1_team_kits_write" ON public.team_kits;
CREATE POLICY "p1_team_kits_write" ON public.team_kits FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ── 5. Presenças: o jogador deixa de as escrever diretamente (PRES-01/SEC-21) ──
-- A auto-presença por fotografia passa pela API (service role, com validação de data/época).
DROP POLICY IF EXISTS "p1_training_attendance_own_insert" ON public.training_attendance;
DROP POLICY IF EXISTS "p1_training_attendance_own_update" ON public.training_attendance;

-- ── 6. access_requests só pela API (rate-limit + honeypot) (SEC-20) ────
DROP POLICY IF EXISTS "p1_access_requests_insert" ON public.access_requests;
REVOKE INSERT ON public.access_requests FROM anon;

-- ── 7. O utilizador não altera o próprio email em public.users (SEC-24) ─
CREATE OR REPLACE FUNCTION public.prevent_sensitive_column_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  -- Só um admin ATIVO está isento (um admin desativado não se pode reativar a si próprio)
  IF public.has_active_role(ARRAY['admin']) THEN RETURN NEW; END IF;
  IF NEW.role                 IS DISTINCT FROM OLD.role                 THEN RAISE EXCEPTION 'Sem permissão para alterar o campo role'; END IF;
  IF NEW.status               IS DISTINCT FROM OLD.status               THEN RAISE EXCEPTION 'Sem permissão para alterar o campo status'; END IF;
  IF NEW.active               IS DISTINCT FROM OLD.active               THEN RAISE EXCEPTION 'Sem permissão para alterar o campo active'; END IF;
  IF NEW.roles_extra          IS DISTINCT FROM OLD.roles_extra          THEN RAISE EXCEPTION 'Sem permissão para alterar o campo roles_extra'; END IF;
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN RAISE EXCEPTION 'Sem permissão para alterar o campo must_change_password'; END IF;
  IF NEW.email                IS DISTINCT FROM OLD.email                THEN RAISE EXCEPTION 'Sem permissão para alterar o campo email'; END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
