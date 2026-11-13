-- Fase 4c: utilizadores autenticados só leem definições do seu clube ou de clubes públicos. JÁ APLICADA em produção.
DROP POLICY IF EXISTS club_isolation_sel ON public.club_settings;
CREATE POLICY club_isolation_sel ON public.club_settings AS RESTRICTIVE FOR SELECT TO authenticated
USING (club_id = ANY (public.my_club_ids()) OR is_public = true);
