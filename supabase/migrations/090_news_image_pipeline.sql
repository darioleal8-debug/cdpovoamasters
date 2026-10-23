-- 090_news_image_pipeline.sql
-- Colunas para o pipeline de geração de imagens com IA por notícia

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS image_prompt  text,
  ADD COLUMN IF NOT EXISTS image_status  text
    CONSTRAINT news_image_status_check
      CHECK (image_status IN ('pending', 'ready', 'failed'));
