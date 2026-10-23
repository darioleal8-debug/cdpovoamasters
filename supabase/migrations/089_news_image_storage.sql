-- 089_news_image_storage.sql
-- Cria o bucket público 'noticias' para imagens de artigos da Liga INATEL.
-- RLS: leitura pública; upload/update/delete apenas por liga admins.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('noticias', 'noticias', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "noticias_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'noticias');

CREATE POLICY "noticias_liga_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'noticias' AND public.is_liga_admin());

CREATE POLICY "noticias_liga_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING  (bucket_id = 'noticias' AND public.is_liga_admin())
  WITH CHECK (bucket_id = 'noticias' AND public.is_liga_admin());

CREATE POLICY "noticias_liga_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'noticias' AND public.is_liga_admin());
