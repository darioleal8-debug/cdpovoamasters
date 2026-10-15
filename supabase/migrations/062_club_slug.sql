-- Adicionar coluna slug à tabela club_settings para URLs públicas de equipa
ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS slug text;

-- Gerar slug a partir do club_name (translate para remover acentos, lowercase, hífens)
UPDATE public.club_settings
SET slug = lower(
  trim(
    regexp_replace(
      regexp_replace(
        translate(
          coalesce(club_name, 'clube'),
          'áàãâäÁÀÃÂÄéèêëÉÈÊËíìîïÍÌÎÏóòõôöÓÒÕÔÖúùûüÚÙÛÜçÇñÑ',
          'aaaaaaaaaaeeeeeeeeiiiiiiiiooooooooooouuuuuuuuccnn'
        ),
        '[^a-zA-Z0-9\s-]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  )
)
WHERE slug IS NULL OR slug = '';

-- Fallback para linhas que ainda ficaram nulas (não deve acontecer)
UPDATE public.club_settings
SET slug = 'clube-' || substr(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

-- Tornar unique (mas nullable para clubs criados antes de configurarem o slug)
DO $$
BEGIN
  ALTER TABLE public.club_settings ADD CONSTRAINT club_settings_slug_unique UNIQUE (slug);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
