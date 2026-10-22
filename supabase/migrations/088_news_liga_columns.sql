-- 088_news_liga_columns.sql
-- Adiciona colunas de contexto Liga INATEL à tabela news.
-- Garante idempotência (1 notícia por jogo) e rastreabilidade.
-- Sem dados migrados — a tabela noticias fica deprecated (sem remoção imediata).

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_submission_id UUID REFERENCES public.result_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_team_name TEXT,
  ADD COLUMN IF NOT EXISTS away_team_name TEXT;

-- No máximo 1 notícia por jogo (idempotência via game_id)
CREATE UNIQUE INDEX IF NOT EXISTS news_game_id_unique
  ON public.news(game_id)
  WHERE game_id IS NOT NULL;
