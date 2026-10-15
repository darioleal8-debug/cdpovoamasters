-- 064_documents.sql
-- Documentos oficiais do clube: regulamentos, calendários, financeiro, seguros, etc.

-- Enum de categorias
CREATE TYPE public.document_category AS ENUM (
  'regulamentos',
  'calendario',
  'financeiro',
  'seguros_saude',
  'clube',
  'formularios'
);

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.documents (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  season        text        NOT NULL,
  title         text        NOT NULL,
  summary       text,
  category      public.document_category NOT NULL,
  file_url      text        NOT NULL,
  storage_key   text        NOT NULL,
  file_size     bigint      NOT NULL DEFAULT 0,
  page_count    int,
  version       int         NOT NULL DEFAULT 1,
  admin_note    text,
  required      boolean     NOT NULL DEFAULT false,
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz
);

CREATE INDEX IF NOT EXISTS documents_season_idx     ON public.documents(season);
CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON public.documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS documents_category_idx   ON public.documents(category);

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Membros autenticados lêem documentos não arquivados; admins lêem tudo
CREATE POLICY "documents_read" ON public.documents
  FOR SELECT TO authenticated
  USING (archived_at IS NULL OR public.is_admin());

-- Só admins escrevem (INSERT / UPDATE / DELETE)
CREATE POLICY "documents_admin_write" ON public.documents
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.documents_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_set_updated_at();

-- ─── Storage ────────────────────────────────────────────────────────────────
-- Bucket público (URL pública protegida apenas por RLS na tabela documents)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-documents',
  'club-documents',
  true,
  20971520,   -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Qualquer pessoa pode fazer download (URL pública)
DROP POLICY IF EXISTS "docs_public_read" ON storage.objects;
CREATE POLICY "docs_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'club-documents');

-- Só admins fazem upload
DROP POLICY IF EXISTS "docs_admin_insert" ON storage.objects;
CREATE POLICY "docs_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'club-documents' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "docs_admin_update" ON storage.objects;
CREATE POLICY "docs_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING    (bucket_id = 'club-documents' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'club-documents' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "docs_admin_delete" ON storage.objects;
CREATE POLICY "docs_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'club-documents' AND (SELECT public.is_admin()));
