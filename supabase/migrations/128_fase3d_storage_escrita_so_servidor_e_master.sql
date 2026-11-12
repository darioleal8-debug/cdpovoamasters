-- Fase 3d: escrita direta nos buckets de clube (club-documents, club-logos, player-photos)
-- só para o Master Admin. Uploads normais passam pelas rotas da API (service role). JÁ APLICADA em produção.
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('docs_admin_insert','club-documents','INSERT'),('docs_admin_update','club-documents','UPDATE'),('docs_admin_delete','club-documents','DELETE'),
    ('p1_club_logos_upload','club-logos','INSERT'),('p1_club_logos_update','club-logos','UPDATE'),('p1_club_logos_delete','club-logos','DELETE'),
    ('p1_player_photos_upload','player-photos','INSERT'),('p1_player_photos_update','player-photos','UPDATE'),('p1_player_photos_delete','player-photos','DELETE')
  ) AS v(pol, bucket, cmd) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.pol);
    IF r.cmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND (SELECT public.is_master_admin()))', r.pol, r.bucket);
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND (SELECT public.is_master_admin())) WITH CHECK (bucket_id = %L AND (SELECT public.is_master_admin()))', r.pol, r.bucket, r.bucket);
    ELSE
      EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND (SELECT public.is_master_admin()))', r.pol, r.bucket);
    END IF;
  END LOOP;
END
$mig$;
