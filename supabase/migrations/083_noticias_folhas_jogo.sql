-- Migração 083: tabela noticias + bucket folhas-jogo

-- 1. Tabela noticias
CREATE TABLE IF NOT EXISTS public.noticias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  entrada text NOT NULL DEFAULT '',
  corpo text NOT NULL,
  estado text NOT NULL DEFAULT 'publicado'
    CHECK (estado IN ('rascunho', 'publicado', 'despublicado')),
  extraction_raw jsonb,
  extraction_final jsonb,
  publicado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.noticias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "noticias_public_read" ON public.noticias
  FOR SELECT TO public USING (estado = 'publicado');
CREATE POLICY "noticias_auth_read" ON public.noticias
  FOR SELECT TO authenticated USING (estado = 'publicado');
CREATE POLICY "noticias_admin_all" ON public.noticias
  FOR ALL TO authenticated
  USING (public.is_liga_admin() OR public.is_admin())
  WITH CHECK (public.is_liga_admin() OR public.is_admin());

CREATE UNIQUE INDEX IF NOT EXISTS noticias_game_id_unique
  ON public.noticias(game_id) WHERE game_id IS NOT NULL;

-- 2. Bucket folhas-jogo (privado, 15 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'folhas-jogo', 'folhas-jogo', false, 15728640,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "delegate_upload_folha_jogo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'folhas-jogo'
  AND EXISTS (SELECT 1 FROM public.league_team_members WHERE user_id = auth.uid())
);
CREATE POLICY "delegate_read_own_folha_jogo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'folhas-jogo'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "admin_read_all_folhas_jogo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'folhas-jogo'
  AND (public.is_liga_admin() OR public.is_admin())
);
