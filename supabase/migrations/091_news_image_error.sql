-- 091_news_image_error.sql
-- Coluna para registar mensagem de erro quando a geração de imagem IA falha

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS image_error text;
