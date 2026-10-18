-- =====================================================================
-- REVERSÃO da 056 (NÃO aplicar por rotina). Repõe as definições de produção
-- anteriores a 2026-10-13. Nota: os valores acrescentados ao enum play_event_type
-- não podem ser removidos em Postgres (ficam, sem efeito).
-- ATENÇÃO: reverter reabre a fuga do chat (SEC-01).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role = 'admin') $$;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista')) $$;
CREATE OR REPLACE FUNCTION public.is_trainer_or_above() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista', 'treinador')) $$;

DROP POLICY IF EXISTS "p1_chat_messages_participant_select" ON public.chat_messages;
CREATE POLICY "p1_chat_messages_participant_select" ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = chat_id AND cp.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "p1_chat_messages_participant_insert" ON public.chat_messages;
CREATE POLICY "p1_chat_messages_participant_insert" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = chat_id AND cp.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "p1_chats_participant" ON public.chats;
CREATE POLICY "p1_chats_participant" ON public.chats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = id AND cp.user_id = (SELECT auth.uid())));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('events','p1_events_write'),('players','p1_players_write'),('game_callups','p1_game_callups_write'),
    ('league_teams','p1_league_teams_write'),('calendar_imports','p1_calendar_imports'),('club_events','p1_club_events_write'),
    ('player_payments','p1_player_payments_staff'),('player_payments_history','p1_player_payments_history_staff'),
    ('payment_receipts','p1_payment_receipts_staff'),('payments','p1_payments_staff'),('financial_entries','p1_financial_entries'),
    ('financial_expenses','p1_financial_expenses'),('financial_cash_movements','p1_financial_cash_movements'),
    ('seasons','p1_seasons_write'),('club_settings','p1_club_settings_write'),('player_photo_templates','p1_player_photo_templates'),
    ('team_kits','p1_team_kits_write')) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff())', r.pol, r.tbl);
  END LOOP;
END $$;

CREATE POLICY "p1_training_attendance_own_insert" ON public.training_attendance FOR INSERT TO authenticated
  WITH CHECK (player_id IN (SELECT players.id FROM public.players WHERE players.user_id = auth.uid()));
CREATE POLICY "p1_training_attendance_own_update" ON public.training_attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())));

GRANT INSERT ON public.access_requests TO anon;
CREATE POLICY "p1_access_requests_insert" ON public.access_requests FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.prevent_sensitive_column_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid AND role = 'admin') THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Sem permissão para alterar o campo role'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Sem permissão para alterar o campo status'; END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN RAISE EXCEPTION 'Sem permissão para alterar o campo active'; END IF;
  IF NEW.roles_extra IS DISTINCT FROM OLD.roles_extra THEN RAISE EXCEPTION 'Sem permissão para alterar o campo roles_extra'; END IF;
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN RAISE EXCEPTION 'Sem permissão para alterar o campo must_change_password'; END IF;
  RETURN NEW;
END; $$;

DROP FUNCTION IF EXISTS public.is_manager();
DROP FUNCTION IF EXISTS public.is_finance();
DROP FUNCTION IF EXISTS public.has_active_role(text[]);
NOTIFY pgrst, 'reload schema';
