-- Migração 082: bucket game-sheets + coluna photo_url em result_submissions

-- 1. Coluna photo_url em result_submissions
ALTER TABLE public.result_submissions
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Bucket privado para fotos de folhas de jogo
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'game-sheets', 'game-sheets', false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS: delegado pode fazer upload das suas fotos
CREATE POLICY "team_member_upload_game_sheet"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'game-sheets'
  AND EXISTS (SELECT 1 FROM public.league_team_members WHERE user_id = auth.uid())
);

-- 4. RLS: liga_admin e admin podem ler todas as fotos
CREATE POLICY "liga_admin_read_game_sheets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'game-sheets'
  AND (public.is_liga_admin() OR public.is_admin())
);

-- 5. RLS: delegado pode ler as suas próprias fotos (path: <user_id>/...)
CREATE POLICY "team_member_read_own_game_sheets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'game-sheets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
