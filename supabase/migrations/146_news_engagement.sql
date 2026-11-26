-- 146_news_engagement.sql
-- Interação com as notícias públicas (Liga INATEL e gerais):
--
--  1. news_view_counts — contador de visualizações por notícia
--  2. news_view_log    — 1 linha por visitante/notícia/dia (evita contar refrescos repetidos)
--  3. news_votes       — voto "gostei" (1) / "não gostei" (-1), 1 por visitante e notícia
--  4. register_news_view(), vote_news(), get_news_engagement() — únicas portas de acesso
--
-- Privacidade: não guarda IP nem user-agent. O visitante é um id aleatório gerado no
-- browser (localStorage), sem ligação a dados pessoais — o mesmo da analítica da Liga.
-- RLS ativa e SEM políticas: a escrita/leitura faz-se só pelas funções SECURITY DEFINER,
-- que validam os dados, só aceitam notícias publicadas e limitam abusos.
-- Idempotente.

-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.news_view_counts (
  news_id UUID   PRIMARY KEY REFERENCES public.news(id) ON DELETE CASCADE,
  views   BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.news_view_log (
  news_id    UUID        NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  visitor_id TEXT        NOT NULL,
  day        DATE        NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Lisbon')::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (news_id, visitor_id, day)
);
CREATE INDEX IF NOT EXISTS nvl_visitor_created_idx ON public.news_view_log (visitor_id, created_at);

CREATE TABLE IF NOT EXISTS public.news_votes (
  news_id    UUID        NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  visitor_id TEXT        NOT NULL,
  vote       SMALLINT    NOT NULL CHECK (vote IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (news_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS nv_visitor_updated_idx ON public.news_votes (visitor_id, updated_at);

ALTER TABLE public.news_view_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_view_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_votes       ENABLE ROW LEVEL SECURITY;
-- Sem políticas: anon/authenticated não leem nem escrevem diretamente.

-- ─── 2. Estado atual (visualizações, votos e voto do visitante) ──────────────
CREATE OR REPLACE FUNCTION public.get_news_engagement(
  p_news_id    UUID,
  p_visitor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'views',    coalesce((SELECT views FROM public.news_view_counts WHERE news_id = p_news_id), 0),
    'likes',    (SELECT count(*) FROM public.news_votes WHERE news_id = p_news_id AND vote = 1),
    'dislikes', (SELECT count(*) FROM public.news_votes WHERE news_id = p_news_id AND vote = -1),
    'my_vote',  CASE
                  WHEN p_visitor_id IS NULL OR p_visitor_id !~ '^[A-Za-z0-9-]{8,64}$' THEN 0
                  ELSE coalesce((SELECT vote FROM public.news_votes
                                  WHERE news_id = p_news_id AND visitor_id = p_visitor_id), 0)
                END
  )
  WHERE EXISTS (SELECT 1 FROM public.news WHERE id = p_news_id AND is_published = true);
$$;

-- ─── 3. Registar visualização (1 por visitante, notícia e dia) ───────────────
CREATE OR REPLACE FUNCTION public.register_news_view(
  p_news_id    UUID,
  p_visitor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  IF p_visitor_id IS NULL OR p_visitor_id !~ '^[A-Za-z0-9-]{8,64}$' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.news WHERE id = p_news_id AND is_published = true) THEN
    RETURN NULL;
  END IF;

  -- Limite anti-abuso: 300 notícias novas por visitante por hora
  IF (SELECT count(*) FROM public.news_view_log
       WHERE visitor_id = p_visitor_id AND created_at > now() - interval '1 hour') < 300 THEN
    INSERT INTO public.news_view_log (news_id, visitor_id)
    VALUES (p_news_id, p_visitor_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      INSERT INTO public.news_view_counts (news_id, views)
      VALUES (p_news_id, 1)
      ON CONFLICT (news_id) DO UPDATE SET views = public.news_view_counts.views + 1;
    END IF;
  END IF;

  RETURN public.get_news_engagement(p_news_id, p_visitor_id);
END;
$$;

-- ─── 4. Votar: 1 = gostei, -1 = não gostei, 0 = retirar o voto ───────────────
CREATE OR REPLACE FUNCTION public.vote_news(
  p_news_id    UUID,
  p_visitor_id TEXT,
  p_vote       SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_visitor_id IS NULL OR p_visitor_id !~ '^[A-Za-z0-9-]{8,64}$' THEN RETURN NULL; END IF;
  IF p_vote IS NULL OR p_vote NOT IN (1, -1, 0) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.news WHERE id = p_news_id AND is_published = true) THEN
    RETURN NULL;
  END IF;

  -- Limite anti-abuso: 120 alterações de voto por visitante por hora
  IF (SELECT count(*) FROM public.news_votes
       WHERE visitor_id = p_visitor_id AND updated_at > now() - interval '1 hour') >= 120 THEN
    RETURN public.get_news_engagement(p_news_id, p_visitor_id);
  END IF;

  IF p_vote = 0 THEN
    DELETE FROM public.news_votes WHERE news_id = p_news_id AND visitor_id = p_visitor_id;
  ELSE
    INSERT INTO public.news_votes (news_id, visitor_id, vote)
    VALUES (p_news_id, p_visitor_id, p_vote)
    ON CONFLICT (news_id, visitor_id)
    DO UPDATE SET vote = EXCLUDED.vote, updated_at = now();
  END IF;

  RETURN public.get_news_engagement(p_news_id, p_visitor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_news_engagement(UUID, TEXT)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_news_view(UUID, TEXT)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vote_news(UUID, TEXT, SMALLINT)     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_news_engagement(UUID, TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_news_view(UUID, TEXT)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vote_news(UUID, TEXT, SMALLINT)  TO anon, authenticated;
