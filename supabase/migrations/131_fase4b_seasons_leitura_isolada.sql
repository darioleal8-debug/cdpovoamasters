-- Fase 4b: utilizadores autenticados só leem épocas do seu clube (ou da sua equipa da Liga / admins da Liga).
-- Evita colisão de épocas ativas entre clubes (.maybeSingle) e fuga de épocas entre clubes. JÁ APLICADA em produção.
DROP POLICY IF EXISTS club_isolation_sel ON public.seasons;
CREATE POLICY club_isolation_sel ON public.seasons AS RESTRICTIVE FOR SELECT TO authenticated
USING (club_id = ANY (public.my_club_ids()) OR public.is_liga_admin() OR (league_team_id IS NOT NULL AND league_team_id = public.get_my_league_team_id()));
