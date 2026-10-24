-- 092_news_image_error_type.sql
-- Tipo de erro estruturado da geração de imagem IA (BILLING, AUTH, RATE_LIMIT, TRANSIENT, CONTENT, UNKNOWN)

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS image_error_type text
    CONSTRAINT news_image_error_type_check
      CHECK (image_error_type IN ('BILLING', 'AUTH', 'RATE_LIMIT', 'TRANSIENT', 'CONTENT', 'UNKNOWN'));
