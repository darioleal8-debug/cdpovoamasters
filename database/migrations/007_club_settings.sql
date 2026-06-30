-- =========================================================
-- MIGRAÇÃO 007: Configurações do Clube (logotipo + cores)
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
--
-- PASSO EXTRA (fazer antes de testar upload):
--   Supabase Dashboard → Storage → New Bucket
--   Nome: club-logos
--   Marcar: Public bucket ✓
-- =========================================================

-- ── Tabela singleton ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.club_settings (
  id              TEXT        PRIMARY KEY DEFAULT 'default',
  club_name       TEXT        NOT NULL    DEFAULT 'CD Póvoa Masters',
  logo_url        TEXT,
  primary_color   TEXT        NOT NULL    DEFAULT '#1e40af',
  secondary_color TEXT        NOT NULL    DEFAULT '#dc2626',
  accent_color    TEXT        NOT NULL    DEFAULT '#ffffff',
  updated_at      TIMESTAMPTZ NOT NULL    DEFAULT now()
);

-- Garantir que sempre existe uma linha
INSERT INTO public.club_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_select" ON public.club_settings;
DROP POLICY IF EXISTS "cs_all"    ON public.club_settings;

CREATE POLICY "cs_select" ON public.club_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "cs_all"    ON public.club_settings FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ── Storage bucket (executar se o bucket ainda não existe) ─
-- O bucket tem de ser criado pela UI do Supabase ou com:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('club-logos', 'club-logos', true)
-- ON CONFLICT DO NOTHING;

-- Política de upload: qualquer utilizador autenticado
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'club_logos_upload' AND tablename = 'objects'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "club_logos_upload"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'club-logos');
    $pol$;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'club_logos_public' AND tablename = 'objects'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "club_logos_public"
        ON storage.objects FOR SELECT TO public
        USING (bucket_id = 'club-logos');
    $pol$;
  END IF;
END $$;

-- =========================================================
-- Verificação:
-- SELECT * FROM public.club_settings;
-- =========================================================
