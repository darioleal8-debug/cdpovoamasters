-- Fase 3a: isolamento de users, chat, histórico e club_settings.
-- JÁ APLICADA em produção (20261112231506).
DO $mig$
DECLARE
  hist_t text[] := ARRAY['hist_seasons','hist_games','hist_players','hist_player_stats'];
  t text;
  v_clubA uuid;
BEGIN
  SELECT id INTO v_clubA FROM public.clubs WHERE slug='cd-povoa-masters';
  IF v_clubA IS NULL THEN RAISE EXCEPTION 'clube base em falta'; END IF;

  CREATE OR REPLACE FUNCTION public.shares_club_with(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT p_user = (SELECT auth.uid()) OR EXISTS (
        SELECT 1 FROM public.club_members a JOIN public.club_members b ON b.club_id = a.club_id
        WHERE a.user_id = (SELECT auth.uid()) AND a.active AND b.user_id = p_user AND b.active) $f$;
  REVOKE ALL ON FUNCTION public.shares_club_with(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.shares_club_with(uuid) TO authenticated, service_role;

  CREATE OR REPLACE FUNCTION public.chat_in_my_clubs(p_chat uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT EXISTS (SELECT 1 FROM public.chats c WHERE c.id = p_chat AND c.club_id = ANY (public.my_club_ids())) $f$;
  REVOKE ALL ON FUNCTION public.chat_in_my_clubs(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.chat_in_my_clubs(uuid) TO authenticated, service_role;

  DROP POLICY IF EXISTS club_isolation_sel ON public.users;
  DROP POLICY IF EXISTS club_isolation_upd ON public.users;
  DROP POLICY IF EXISTS club_isolation_del ON public.users;
  CREATE POLICY club_isolation_sel ON public.users AS RESTRICTIVE FOR SELECT TO authenticated USING (public.shares_club_with(id));
  CREATE POLICY club_isolation_upd ON public.users AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.shares_club_with(id)) WITH CHECK (public.shares_club_with(id));
  CREATE POLICY club_isolation_del ON public.users AS RESTRICTIVE FOR DELETE TO authenticated USING (public.shares_club_with(id));
  DROP POLICY IF EXISTS club_isolation_sel ON public.user_display_names;
  CREATE POLICY club_isolation_sel ON public.user_display_names AS RESTRICTIVE FOR SELECT TO authenticated USING (public.shares_club_with(id));
  DROP POLICY IF EXISTS club_isolation ON public.user_activity_logs;
  CREATE POLICY club_isolation ON public.user_activity_logs AS RESTRICTIVE FOR SELECT TO authenticated USING (public.shares_club_with(user_id));
  DROP POLICY IF EXISTS club_isolation ON public.user_activation_tokens;
  CREATE POLICY club_isolation ON public.user_activation_tokens AS RESTRICTIVE FOR ALL TO authenticated USING (public.shares_club_with(user_id)) WITH CHECK (public.shares_club_with(user_id));

  DROP POLICY IF EXISTS club_isolation ON public.chat_messages;
  CREATE POLICY club_isolation ON public.chat_messages AS RESTRICTIVE FOR ALL TO authenticated USING (public.chat_in_my_clubs(chat_id)) WITH CHECK (public.chat_in_my_clubs(chat_id));
  DROP POLICY IF EXISTS club_isolation ON public.chat_participants;
  CREATE POLICY club_isolation ON public.chat_participants AS RESTRICTIVE FOR ALL TO authenticated USING (public.chat_in_my_clubs(chat_id)) WITH CHECK (public.chat_in_my_clubs(chat_id));

  FOREACH t IN ARRAY hist_t LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(club_id)', t||'_club_id_idx', t);
    EXECUTE format('UPDATE public.%I SET club_id = %L WHERE club_id IS NULL', t, v_clubA);
    EXECUTE format('DROP TRIGGER IF EXISTS set_club_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_club_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_club_id_default()', t);
    EXECUTE format('DROP POLICY IF EXISTS club_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY club_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (club_id = ANY (public.my_club_ids())) WITH CHECK (club_id = ANY (public.my_club_ids()))', t);
  END LOOP;

  ALTER TABLE public.club_settings ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id);
  UPDATE public.club_settings SET club_id = v_clubA WHERE club_id IS NULL;
  DROP POLICY IF EXISTS club_isolation_ins ON public.club_settings;
  DROP POLICY IF EXISTS club_isolation_upd ON public.club_settings;
  DROP POLICY IF EXISTS club_isolation_del ON public.club_settings;
  CREATE POLICY club_isolation_ins ON public.club_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (club_id = ANY (public.my_club_ids()));
  CREATE POLICY club_isolation_upd ON public.club_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING (club_id = ANY (public.my_club_ids())) WITH CHECK (club_id = ANY (public.my_club_ids()));
  CREATE POLICY club_isolation_del ON public.club_settings AS RESTRICTIVE FOR DELETE TO authenticated USING (club_id = ANY (public.my_club_ids()));
END
$mig$;
