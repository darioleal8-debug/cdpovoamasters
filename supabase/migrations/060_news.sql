-- Tabela de notícias públicas
CREATE TABLE IF NOT EXISTS public.news (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug            text        NOT NULL UNIQUE,
  title           text        NOT NULL,
  excerpt         text        NOT NULL,
  body            text        NOT NULL DEFAULT '',
  category        text        NOT NULL DEFAULT 'Geral',
  cover_image_url text,
  published_at    timestamptz NOT NULL DEFAULT now(),
  is_published    boolean     NOT NULL DEFAULT false,
  is_featured     boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_published_at_idx
  ON public.news (published_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS news_slug_idx
  ON public.news (slug);

-- RLS
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler notícias publicadas
CREATE POLICY "news_public_read" ON public.news
  FOR SELECT USING (is_published = true);

-- Só administradores gerem notícias (criar, editar, apagar, ler rascunhos)
CREATE POLICY "news_admin_all" ON public.news
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.news_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER news_updated_at
  BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.news_set_updated_at();
