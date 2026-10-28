-- 114_liga_page_views.sql
-- Estatísticas de utilização da Liga INATEL (hoophub.pt/liga-inatel)
--
--  1. Tabela liga_page_views — uma linha por página vista (anónimos e registados)
--  2. log_liga_page_view()  — regista uma visita (anon/authenticated; user_id = auth.uid())
--  3. end_liga_page_view()  — grava a duração da visita quando o visitante sai da página
--  4. liga_analytics(days)  — agregados para o painel do admin (só is_liga_admin())
--
-- Privacidade: não guarda IP nem user-agent. Visitantes anónimos são identificados
-- por um id aleatório gerado no browser (localStorage), sem ligação a dados pessoais.
-- Idempotente.

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.liga_page_views (
  id            BIGSERIAL    PRIMARY KEY,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  visitor_id    TEXT         NOT NULL,
  session_id    TEXT         NOT NULL,
  user_id       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  user_kind     TEXT         NOT NULL DEFAULT 'anonimo'
                CHECK (user_kind IN ('anonimo', 'delegado', 'admin', 'clube', 'registado')),
  team_id       UUID,
  path          TEXT         NOT NULL,
  referrer_host TEXT,
  device        TEXT         CHECK (device IN ('mobile', 'tablet', 'desktop')),
  is_pwa        BOOLEAN      NOT NULL DEFAULT false,
  country       TEXT,
  duration_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS lpv_created_at_idx ON public.liga_page_views (created_at);
CREATE INDEX IF NOT EXISTS lpv_visitor_idx    ON public.liga_page_views (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS lpv_user_idx       ON public.liga_page_views (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.liga_page_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'liga_page_views' AND policyname = 'lpv_admin_select'
  ) THEN
    CREATE POLICY lpv_admin_select ON public.liga_page_views
      FOR SELECT TO authenticated USING (public.is_liga_admin());
  END IF;
END $$;
-- Sem políticas INSERT/UPDATE: a escrita é feita apenas pelas funções abaixo.

-- ─── 2. Registar visita ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_liga_page_view(
  p_visitor_id    TEXT,
  p_session_id    TEXT,
  p_path          TEXT,
  p_referrer_host TEXT    DEFAULT NULL,
  p_device        TEXT    DEFAULT NULL,
  p_is_pwa        BOOLEAN DEFAULT false,
  p_country       TEXT    DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_kind TEXT := 'anonimo';
  v_team UUID;
  v_id   BIGINT;
BEGIN
  -- Validação básica
  IF p_visitor_id IS NULL OR p_visitor_id !~ '^[A-Za-z0-9-]{8,64}$' THEN RETURN NULL; END IF;
  IF p_session_id IS NULL OR p_session_id !~ '^[A-Za-z0-9-]{8,64}$' THEN RETURN NULL; END IF;
  IF p_path IS NULL OR p_path !~ '^/liga-inatel(/|$)' OR length(p_path) > 300 THEN RETURN NULL; END IF;
  IF p_path ~ '^/liga-inatel/admin(/|$)' THEN RETURN NULL; END IF;

  -- Limite: 300 páginas por visitante por hora (anti-abuso)
  IF (SELECT count(*) FROM public.liga_page_views
       WHERE visitor_id = p_visitor_id AND created_at > now() - interval '1 hour') >= 300 THEN
    RETURN NULL;
  END IF;

  -- Tipo de utilizador
  IF v_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.liga_admins WHERE user_id = v_uid) THEN
      v_kind := 'admin';
    ELSE
      SELECT team_id INTO v_team FROM public.league_team_members WHERE user_id = v_uid LIMIT 1;
      IF v_team IS NOT NULL THEN
        v_kind := 'delegado';
      ELSIF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
        v_kind := 'clube';
      ELSE
        v_kind := 'registado';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.liga_page_views
    (visitor_id, session_id, user_id, user_kind, team_id, path, referrer_host, device, is_pwa, country)
  VALUES (
    p_visitor_id,
    p_session_id,
    v_uid,
    v_kind,
    v_team,
    p_path,
    nullif(left(lower(p_referrer_host), 120), ''),
    CASE WHEN p_device IN ('mobile', 'tablet', 'desktop') THEN p_device END,
    coalesce(p_is_pwa, false),
    CASE WHEN p_country ~ '^[A-Z]{2}$' THEN p_country END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 3. Duração da visita ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_liga_page_view(
  p_id          BIGINT,
  p_visitor_id  TEXT,
  p_duration_ms INTEGER
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.liga_page_views
     SET duration_ms = least(greatest(p_duration_ms, 0), 3600000)
   WHERE id = p_id
     AND visitor_id = p_visitor_id
     AND duration_ms IS NULL
     AND created_at > now() - interval '2 hours';
$$;

REVOKE ALL ON FUNCTION public.log_liga_page_view(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_liga_page_view(BIGINT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_liga_page_view(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_liga_page_view(BIGINT, TEXT, INTEGER) TO anon, authenticated;

-- ─── 4. Agregados para o admin ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.liga_analytics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_days  INTEGER     := least(greatest(coalesce(p_days, 30), 1), 365);
  v_tz    TEXT        := 'Europe/Lisbon';
  v_today DATE        := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_from  TIMESTAMPTZ;
  v_prev  TIMESTAMPTZ;
  v_res   JSONB;
BEGIN
  IF NOT public.is_liga_admin() THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  v_from := ((v_today - (v_days - 1))::timestamp AT TIME ZONE v_tz);
  v_prev := ((v_today - (2 * v_days - 1))::timestamp AT TIME ZONE v_tz);

  WITH pv AS (
    SELECT * FROM public.liga_page_views WHERE created_at >= v_from
  ),
  prev AS (
    SELECT * FROM public.liga_page_views WHERE created_at >= v_prev AND created_at < v_from
  ),
  first_seen AS (
    SELECT visitor_id, min(created_at) AS first_at
      FROM public.liga_page_views
     WHERE visitor_id IN (SELECT DISTINCT visitor_id FROM pv)
     GROUP BY visitor_id
  ),
  days AS (
    SELECT generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date AS d
  )
  SELECT jsonb_build_object(
    'period_days', v_days,
    'overview', (
      SELECT jsonb_build_object(
        'views',               count(*),
        'views_anon',          count(*) FILTER (WHERE user_id IS NULL),
        'views_registered',    count(*) FILTER (WHERE user_id IS NOT NULL),
        'visitors',            count(DISTINCT visitor_id),
        'visitors_anon',       count(DISTINCT visitor_id) FILTER (WHERE user_id IS NULL),
        'registered_users',    count(DISTINCT user_id),
        'sessions',            count(DISTINCT session_id),
        'pwa_views',           count(*) FILTER (WHERE is_pwa),
        'avg_duration_s',      round(avg(duration_ms) FILTER (WHERE duration_ms BETWEEN 1000 AND 1800000) / 1000.0),
        'views_today',         count(*) FILTER (WHERE (created_at AT TIME ZONE v_tz)::date = v_today),
        'visitors_today',      count(DISTINCT visitor_id) FILTER (WHERE (created_at AT TIME ZONE v_tz)::date = v_today),
        'new_visitors',        (SELECT count(*) FROM first_seen WHERE first_at >= v_from),
        'returning_visitors',  (SELECT count(*) FROM first_seen WHERE first_at <  v_from),
        'prev_views',          (SELECT count(*) FROM prev),
        'prev_visitors',       (SELECT count(DISTINCT visitor_id) FROM prev)
      ) FROM pv
    ),
    'daily', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'date',             d.d,
               'views_anon',       coalesce(x.va, 0),
               'views_registered', coalesce(x.vr, 0),
               'visitors',         coalesce(x.vis, 0)
             ) ORDER BY d.d), '[]'::jsonb)
        FROM days d
        LEFT JOIN (
          SELECT (created_at AT TIME ZONE v_tz)::date AS d,
                 count(*) FILTER (WHERE user_id IS NULL)     AS va,
                 count(*) FILTER (WHERE user_id IS NOT NULL) AS vr,
                 count(DISTINCT visitor_id)                  AS vis
            FROM pv GROUP BY 1
        ) x ON x.d = d.d
    ),
    'hours', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('hour', h, 'views', coalesce(c, 0)) ORDER BY h), '[]'::jsonb)
        FROM generate_series(0, 23) h
        LEFT JOIN (
          SELECT extract(hour FROM created_at AT TIME ZONE v_tz)::int AS hr, count(*) AS c
            FROM pv GROUP BY 1
        ) x ON x.hr = h
    ),
    'pages', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.views DESC), '[]'::jsonb) FROM (
        SELECT regexp_replace(path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'g') AS path,
               count(*)                   AS views,
               count(DISTINCT visitor_id) AS visitors
          FROM pv GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      ) t
    ),
    'user_kinds', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.views DESC), '[]'::jsonb) FROM (
        SELECT user_kind AS kind, count(*) AS views, count(DISTINCT visitor_id) AS visitors
          FROM pv GROUP BY 1
      ) t
    ),
    'devices', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.visitors DESC), '[]'::jsonb) FROM (
        SELECT coalesce(device, 'desconhecido') AS device, count(*) AS views, count(DISTINCT visitor_id) AS visitors
          FROM pv GROUP BY 1
      ) t
    ),
    'referrers', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.views DESC), '[]'::jsonb) FROM (
        SELECT coalesce(referrer_host, 'direto') AS source, count(*) AS views
          FROM pv GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) t
    ),
    'countries', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.visitors DESC), '[]'::jsonb) FROM (
        SELECT coalesce(country, '??') AS country, count(DISTINCT visitor_id) AS visitors
          FROM pv GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) t
    ),
    'users', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.views DESC), '[]'::jsonb) FROM (
        SELECT p.user_id,
               coalesce(u.name, au.email)        AS name,
               au.email                          AS email,
               max(p.user_kind)                  AS kind,
               lt.name                           AS team,
               count(*)                          AS views,
               count(DISTINCT p.session_id)      AS sessions,
               max(p.created_at)                 AS last_seen
          FROM pv p
          LEFT JOIN auth.users au        ON au.id = p.user_id
          LEFT JOIN public.users u       ON u.id  = p.user_id
          LEFT JOIN public.league_teams lt ON lt.id = p.team_id
         WHERE p.user_id IS NOT NULL
         GROUP BY p.user_id, u.name, au.email, lt.name
         ORDER BY count(*) DESC
         LIMIT 100
      ) t
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.liga_analytics(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liga_analytics(INTEGER) TO authenticated;
