-- Reprodução mínima do schema/RLS de PRODUÇÃO (2026-10-13) para os testes da 056.
-- Políticas copiadas de supabase/migrations/20260919000000_rls_hardening.sql (as que a 056 altera).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TYPE public.play_event_type AS ENUM ('2pt_made','foul_committed','foul_drawn');
CREATE TABLE public.users (id uuid PRIMARY KEY, email text UNIQUE, name text, role text NOT NULL,
  status text, active boolean NOT NULL DEFAULT true, roles_extra jsonb NOT NULL DEFAULT '[]', must_change_password boolean NOT NULL DEFAULT false);
CREATE TABLE public.seasons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.players (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid, user_id uuid);
CREATE TABLE public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid, title text);
CREATE TABLE public.game_callups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid, player_id uuid);
CREATE TABLE public.player_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid, player_id uuid, amount numeric DEFAULT 0, status text DEFAULT 'paid');
CREATE TABLE public.trainings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid);
CREATE TABLE public.training_attendance (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), training_id uuid, player_id uuid, status text);
CREATE TABLE public.chats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text);
CREATE TABLE public.chat_participants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chat_id uuid, user_id uuid);
CREATE TABLE public.chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chat_id uuid, sender_id uuid, content text);
CREATE TABLE public.access_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_name text);
-- Tabelas que a 056 re-aponta (só precisam de existir com RLS)
CREATE TABLE public.league_teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.calendar_imports (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.club_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.player_payments_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid);
CREATE TABLE public.payment_receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid);
CREATE TABLE public.payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.financial_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric);
CREATE TABLE public.financial_expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.financial_cash_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.club_settings (id text PRIMARY KEY);
CREATE TABLE public.player_photo_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.team_kits (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','seasons','players','events','game_callups','player_payments','trainings','training_attendance',
    'chats','chat_participants','chat_messages','access_requests','league_teams','calendar_imports','club_events',
    'player_payments_history','payment_receipts','payments','financial_entries','financial_expenses','financial_cash_movements',
    'club_settings','player_photo_templates','team_kits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
GRANT INSERT ON public.access_requests TO anon;

-- Funções de produção (copiadas)
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role = 'admin') $$;
CREATE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista')) $$;
CREATE FUNCTION public.is_trainer_or_above() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'seccionista', 'treinador')) $$;
CREATE FUNCTION public.prevent_sensitive_column_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
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
CREATE TRIGGER enforce_sensitive_columns BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.prevent_sensitive_column_change();
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_staff(), public.is_trainer_or_above() TO authenticated;

CREATE POLICY "p1_users_select" ON public.users FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_users_update" ON public.users FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()) OR is_admin()) WITH CHECK (id = (SELECT auth.uid()) OR is_admin());
CREATE POLICY "p1_players_select" ON public.players FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_players_write" ON public.players FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_seasons_select" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "p1_seasons_write" ON public.seasons FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_events_select" ON public.events FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_events_write" ON public.events FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_game_callups_select" ON public.game_callups FOR SELECT TO authenticated USING (is_trainer_or_above() OR EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_game_callups_write" ON public.game_callups FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_player_payments_staff" ON public.player_payments FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_player_payments_own" ON public.player_payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_trainings_select" ON public.trainings FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "p1_trainings_write" ON public.trainings FOR ALL TO authenticated USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
CREATE POLICY "p1_training_attendance_staff" ON public.training_attendance FOR ALL TO authenticated USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
CREATE POLICY "p1_training_attendance_own_select" ON public.training_attendance FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_training_attendance_own_insert" ON public.training_attendance FOR INSERT TO authenticated WITH CHECK (player_id IN (SELECT players.id FROM public.players WHERE players.user_id = auth.uid()));
CREATE POLICY "p1_training_attendance_own_update" ON public.training_attendance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_chats_staff" ON public.chats FOR ALL TO authenticated USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
CREATE POLICY "p1_chats_participant" ON public.chats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = id AND cp.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_chat_participants_staff" ON public.chat_participants FOR ALL TO authenticated USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
CREATE POLICY "p1_chat_participants_own" ON public.chat_participants FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "p1_chat_messages_staff" ON public.chat_messages FOR ALL TO authenticated USING (is_trainer_or_above()) WITH CHECK (is_trainer_or_above());
CREATE POLICY "p1_chat_messages_participant_select" ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = chat_id AND cp.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_chat_messages_participant_insert" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.chat_participants cp WHERE cp.chat_id = chat_id AND cp.user_id = (SELECT auth.uid())));
CREATE POLICY "p1_access_requests_insert" ON public.access_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "p1_access_requests_staff_select" ON public.access_requests FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "p1_league_teams_write" ON public.league_teams FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_calendar_imports" ON public.calendar_imports FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_club_events_write" ON public.club_events FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_player_payments_history_staff" ON public.player_payments_history FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_payment_receipts_staff" ON public.payment_receipts FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_payments_staff" ON public.payments FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_financial_entries" ON public.financial_entries FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_financial_expenses" ON public.financial_expenses FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_financial_cash_movements" ON public.financial_cash_movements FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_club_settings_write" ON public.club_settings FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_player_photo_templates" ON public.player_photo_templates FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "p1_team_kits_write" ON public.team_kits FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE TABLE public._results (id serial, test text, ok boolean, detail text);
GRANT INSERT ON public._results TO authenticated, anon; GRANT USAGE ON SEQUENCE public._results_id_seq TO authenticated, anon;
