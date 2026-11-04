-- Adiciona a coluna image_source à tabela news.
-- 'ai'       = imagem gerada pelo fal.ai / pipeline IA
-- 'upload'   = fotografia real enviada pela equipa
-- 'fallback' = placeholder quando não foi possível gerar imagem

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS image_source text
  CONSTRAINT news_image_source_check CHECK (image_source IN ('ai', 'upload', 'fallback'));

-- Inicializa image_source para registos já existentes:
-- se tem cover_photo_id → upload real; se image_status = 'ready' → IA; caso contrário NULL
UPDATE public.news
  SET image_source = CASE
    WHEN cover_photo_id IS NOT NULL THEN 'upload'::text
    WHEN image_status = 'ready' AND cover_image_url IS NOT NULL THEN 'ai'::text
    ELSE NULL::text
  END
WHERE image_source IS NULL;
