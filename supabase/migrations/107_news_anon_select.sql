-- Fase 1: corrige notícias invisíveis para utilizadores não autenticados
-- As policies RLS já existiam (news_public_read, lgr_select_public) mas
-- o GRANT SELECT para o papel anon estava em falta.

-- 1. news — policy news_public_read (is_published = true) já cobre anon via {public}
GRANT SELECT ON public.news TO anon;

-- 2. league_game_results — policy lgr_select_public (qual = true) já cobre anon via {public}
GRANT SELECT ON public.league_game_results TO anon;

-- 3. league_teams — necessário para getGalleryPhotos() em noticias/[slug]/page.tsx
--                   (usa createClient() para resolver nomes de equipas nas fotos do jogo)
GRANT SELECT ON public.league_teams TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'league_teams'
      AND policyname = 'league_teams_anon_select'
  ) THEN
    EXECUTE 'CREATE POLICY league_teams_anon_select
      ON public.league_teams
      FOR SELECT TO anon
      USING (is_placeholder = false)';
  END IF;
END $$;
