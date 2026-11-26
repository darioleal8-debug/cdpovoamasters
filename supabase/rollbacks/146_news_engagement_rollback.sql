-- Rollback da migração 146 (interação com notícias). Apaga visualizações e votos guardados.
DROP FUNCTION IF EXISTS public.vote_news(UUID, TEXT, SMALLINT);
DROP FUNCTION IF EXISTS public.register_news_view(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_news_engagement(UUID, TEXT);
DROP TABLE IF EXISTS public.news_votes;
DROP TABLE IF EXISTS public.news_view_log;
DROP TABLE IF EXISTS public.news_view_counts;
