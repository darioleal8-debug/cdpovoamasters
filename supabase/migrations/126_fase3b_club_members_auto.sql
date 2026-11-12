-- Fase 3b: novos utilizadores ficam associados ao clube (enquanto só existir 1 clube ativo)
-- e role/active ficam sincronizados em club_members. JÁ APLICADA em produção.
CREATE OR REPLACE FUNCTION public.sync_club_member_from_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE user_id = NEW.id)
       AND (SELECT count(*) FROM public.clubs WHERE active) = 1
       AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = NEW.id) THEN
      INSERT INTO public.club_members (club_id, user_id, role, active)
      SELECT id, NEW.id, NEW.role::text, coalesce(NEW.active, true) FROM public.clubs WHERE active LIMIT 1;
    END IF;
  ELSE
    UPDATE public.club_members SET role = NEW.role::text, active = coalesce(NEW.active, true)
    WHERE user_id = NEW.id AND (role IS DISTINCT FROM NEW.role::text OR active IS DISTINCT FROM coalesce(NEW.active, true));
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.sync_club_member_from_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_club_member_ins ON public.users;
CREATE TRIGGER sync_club_member_ins AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_club_member_from_user();
DROP TRIGGER IF EXISTS sync_club_member_upd ON public.users;
CREATE TRIGGER sync_club_member_upd AFTER UPDATE OF role, active ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_club_member_from_user();
