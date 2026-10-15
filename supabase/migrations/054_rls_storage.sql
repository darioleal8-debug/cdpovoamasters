-- =================================================================
-- 054_rls_storage.sql
-- Phase 1.5: Storage — políticas UPDATE + DELETE em falta
--
-- INSERT e SELECT já criados pelo STEP 8 de 20260919000000.
-- Os limites de bucket são re-aplicados (idempotente).
-- =================================================================

-- 1. Confirmar limites dos buckets (idempotente)
UPDATE storage.buckets
   SET file_size_limit    = 5242880,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'player-photos';

UPDATE storage.buckets
   SET file_size_limit    = 2097152,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
 WHERE id = 'club-logos';

-- 2. Políticas UPDATE (substituir ficheiro existente)
DROP POLICY IF EXISTS "p1_club_logos_update"    ON storage.objects;
DROP POLICY IF EXISTS "p1_player_photos_update" ON storage.objects;

CREATE POLICY "p1_club_logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING    (bucket_id = 'club-logos' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'club-logos' AND (SELECT public.is_admin()));

CREATE POLICY "p1_player_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING    (bucket_id = 'player-photos' AND (SELECT public.is_staff()))
  WITH CHECK (bucket_id = 'player-photos' AND (SELECT public.is_staff()));

-- 3. Políticas DELETE
DROP POLICY IF EXISTS "p1_club_logos_delete"    ON storage.objects;
DROP POLICY IF EXISTS "p1_player_photos_delete" ON storage.objects;

CREATE POLICY "p1_club_logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'club-logos' AND (SELECT public.is_admin()));

CREATE POLICY "p1_player_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'player-photos' AND (SELECT public.is_staff()));

-- Verificação
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'p1_%';

  RAISE NOTICE 'storage.objects: % políticas p1_* activas', cnt;

  IF cnt < 7 THEN
    RAISE WARNING 'Esperadas >= 7 políticas p1_* em storage.objects (INSERT×2 + SELECT + UPDATE×2 + DELETE×2)';
  END IF;
END $$;
