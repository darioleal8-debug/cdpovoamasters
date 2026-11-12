-- Rollback das migrações 123–125 (modelo multi-clube + isolamento RLS).
-- Remove as políticas RESTRICTIVE e os triggers; mantém colunas club_id e tabelas clubs/club_members (inócuas).
DO $r$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND policyname LIKE 'club\_isolation%' ESCAPE '\' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT event_object_table AS t FROM information_schema.triggers
           WHERE trigger_schema='public' AND trigger_name='set_club_id' LOOP
    EXECUTE format('DROP TRIGGER set_club_id ON public.%I', r.t);
  END LOOP;
END
$r$;
