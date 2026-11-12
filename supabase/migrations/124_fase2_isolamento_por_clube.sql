-- Fase 2: isolamento por clube com RLS RESTRICTIVE + trigger set_club_id.
-- JÁ APLICADA em produção (20261112171701). Rollback: supabase/rollbacks/123_125_multiclube_rollback.sql
DO $mig$
DECLARE
  strict_t text[] := ARRAY['players','trainings','training_attendance','training_rsvps','training_notes','training_recurrence_rules','game_callups','game_availability','financial_entries','financial_expenses','financial_cash_movements','player_payments','player_payments_history','payment_receipts','documents','chats','birthday_messages','plays','team_kits','access_requests'];
  wonly_t text[] := ARRAY['seasons','palmares','club_events','game_sessions'];
  t text;
BEGIN
  CREATE OR REPLACE FUNCTION public.my_club_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT coalesce(array_agg(club_id), '{}'::uuid[]) FROM public.club_members WHERE user_id = (SELECT auth.uid()) AND active $f$;
  REVOKE ALL ON FUNCTION public.my_club_ids() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.my_club_ids() TO authenticated, service_role;

  CREATE OR REPLACE FUNCTION public.is_league_event(p_competition text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $f$ SELECT p_competition IS NOT NULL AND EXISTS (SELECT 1 FROM public.competitions c WHERE c.competition_key = p_competition) $f$;
  REVOKE ALL ON FUNCTION public.is_league_event(text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_league_event(text) TO authenticated, service_role;

  CREATE OR REPLACE FUNCTION public.set_club_id_default() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
  $f$
  BEGIN
    IF NEW.club_id IS NULL THEN
      IF TG_TABLE_NAME = 'events' AND coalesce((to_jsonb(NEW)->>'is_club_game')::boolean, false) = false THEN RETURN NEW; END IF;
      IF auth.uid() IS NOT NULL THEN
        SELECT club_id INTO NEW.club_id FROM public.club_members WHERE user_id = auth.uid() AND active ORDER BY created_at LIMIT 1;
      END IF;
      IF NEW.club_id IS NULL AND (SELECT count(*) FROM public.clubs WHERE active) = 1 THEN
        SELECT id INTO NEW.club_id FROM public.clubs WHERE active LIMIT 1;
      END IF;
    END IF;
    RETURN NEW;
  END $f$;
  REVOKE ALL ON FUNCTION public.set_club_id_default() FROM PUBLIC, anon, authenticated;

  FOREACH t IN ARRAY ARRAY['seasons','players','trainings','training_attendance','training_rsvps','training_notes','training_recurrence_rules','events','game_callups','game_availability','game_sessions','financial_entries','financial_expenses','financial_cash_movements','player_payments','player_payments_history','payment_receipts','documents','chats','birthday_messages','plays','team_kits','club_events','access_requests','palmares'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_club_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_club_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_club_id_default()', t);
  END LOOP;

  FOREACH t IN ARRAY strict_t LOOP
    EXECUTE format('DROP POLICY IF EXISTS club_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY club_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (club_id = ANY (public.my_club_ids())) WITH CHECK (club_id = ANY (public.my_club_ids()))', t);
  END LOOP;
  FOREACH t IN ARRAY wonly_t LOOP
    EXECUTE format('DROP POLICY IF EXISTS club_isolation_ins ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS club_isolation_upd ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS club_isolation_del ON public.%I', t);
    EXECUTE format('CREATE POLICY club_isolation_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (club_id = ANY (public.my_club_ids()))', t);
    EXECUTE format('CREATE POLICY club_isolation_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (club_id = ANY (public.my_club_ids())) WITH CHECK (club_id = ANY (public.my_club_ids()))', t);
    EXECUTE format('CREATE POLICY club_isolation_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (club_id = ANY (public.my_club_ids()))', t);
  END LOOP;
  DROP POLICY IF EXISTS club_isolation_sel ON public.events;
  DROP POLICY IF EXISTS club_isolation_ins ON public.events;
  DROP POLICY IF EXISTS club_isolation_upd ON public.events;
  DROP POLICY IF EXISTS club_isolation_del ON public.events;
  CREATE POLICY club_isolation_sel ON public.events AS RESTRICTIVE FOR SELECT TO authenticated USING (club_id IS NULL OR club_id = ANY (public.my_club_ids()) OR public.is_league_event(competition));
  CREATE POLICY club_isolation_ins ON public.events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (club_id IS NULL OR club_id = ANY (public.my_club_ids()) OR public.is_liga_admin());
  CREATE POLICY club_isolation_upd ON public.events AS RESTRICTIVE FOR UPDATE TO authenticated USING (club_id IS NULL OR club_id = ANY (public.my_club_ids()) OR public.is_liga_admin()) WITH CHECK (club_id IS NULL OR club_id = ANY (public.my_club_ids()) OR public.is_liga_admin());
  CREATE POLICY club_isolation_del ON public.events AS RESTRICTIVE FOR DELETE TO authenticated USING (club_id IS NULL OR club_id = ANY (public.my_club_ids()) OR public.is_liga_admin());
END
$mig$;
