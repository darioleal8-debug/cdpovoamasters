-- Fase 4a: uma linha de definições (branding) por clube. JÁ APLICADA em produção.
INSERT INTO public.club_settings (id, club_id, club_name, slug, is_public)
SELECT c.slug, c.id, c.name, c.slug, false
FROM public.clubs c
WHERE NOT EXISTS (SELECT 1 FROM public.club_settings s WHERE s.club_id = c.id)
ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS club_settings_club_id_key ON public.club_settings(club_id);
