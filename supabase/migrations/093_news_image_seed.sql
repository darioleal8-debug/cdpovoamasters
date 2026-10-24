-- 093_news_image_seed.sql
-- Seed aleatória usada na geração de imagem fal.ai (para reprodutibilidade e debug)

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS image_seed int;
