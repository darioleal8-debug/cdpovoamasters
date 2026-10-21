-- Migração 081: políticas de storage para logos de equipa liga
-- Permite que membros de league_team_members façam upload/upsert em club-logos/league/

CREATE POLICY "team_member_upload_league_logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND name LIKE 'league/%'
  AND EXISTS (SELECT 1 FROM public.league_team_members WHERE user_id = auth.uid())
);

CREATE POLICY "team_member_update_league_logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'club-logos'
  AND name LIKE 'league/%'
  AND EXISTS (SELECT 1 FROM public.league_team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'club-logos'
  AND name LIKE 'league/%'
  AND EXISTS (SELECT 1 FROM public.league_team_members WHERE user_id = auth.uid())
);
