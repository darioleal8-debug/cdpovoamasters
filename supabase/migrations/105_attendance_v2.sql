-- 105_attendance_v2.sql
-- Fase 2.1: consistência de assiduidade
-- 1. Adiciona foco e deleted_at a trainings (pré-requisitos para 2.6)
-- 2. get_player_attendance_summary:
--    - Filtrar treinos cancelados (deleted_at IS NULL)
--    - played_games exclui stats_source='result_only' (igual à página de stats)
--    - by_comp inclui game_type
-- 3. get_player_attendance_timeline:
--    - Filtrar treinos cancelados
--    - game_played respeita stats_source

-- ─── 1. Colunas novas em trainings ──────────────────────────────────────────

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS foco       TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ─── 2. get_player_attendance_summary ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_attendance_summary(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM   public.players
  WHERE  user_id   = auth.uid()
    AND  season_id = p_season_id
  LIMIT 1;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM   public.players
    WHERE  user_id = auth.uid()
    ORDER  BY created_at DESC
    LIMIT  1;
  END IF;

  IF v_player_id IS NULL THEN
    RETURN json_build_object('player_id', NULL, 'empty', true);
  END IF;

  RETURN (
    WITH
    -- Jogos terminados desta temporada (excluir testes)
    finished_games AS (
      SELECT e.id            AS event_id,
             gs.id           AS game_session_id,
             gs.stats_source,
             e.game_type,
             COALESCE(e.competition, 'Outros') AS competition
      FROM   public.events       e
      JOIN   public.game_sessions gs ON gs.event_id = e.id
      WHERE  e.season_id      = p_season_id
        AND  e.type           = 'jogo'
        AND  e.is_test        IS NOT TRUE
        AND  gs.status        = 'finished'
    ),
    -- Apenas jogos com estatísticas ao vivo (exclui result_only) —
    -- critério igual ao da página de estatísticas (STA-*)
    live_games AS (
      SELECT * FROM finished_games
      WHERE  stats_source <> 'result_only'
    ),
    -- Participação efetiva do jogador em jogos ao vivo
    played_games AS (
      SELECT pgs.game_session_id, pgs.seconds_played
      FROM   public.player_game_stats pgs
      WHERE  pgs.player_id       = v_player_id
        AND  pgs.game_session_id IN (SELECT game_session_id FROM live_games)
    ),
    -- Presenças em treinos (excluir treinos cancelados)
    ta_agg AS (
      SELECT
        COUNT(*)                                                                           AS total,
        COUNT(*) FILTER (WHERE ta.status IN ('present','auto_present'))                    AS n_present,
        COUNT(*) FILTER (WHERE ta.status = 'absent')                                       AS n_absent,
        COUNT(*) FILTER (WHERE ta.status = 'justified')                                    AS n_justified,
        COUNT(*) FILTER (WHERE ta.status = 'late')                                         AS n_late,
        COUNT(*) FILTER (WHERE ta.status = 'auto_present')                                 AS n_auto_present,
        ROUND(
          COUNT(*) FILTER (WHERE ta.status IN ('present','late','auto_present'))::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
        ) AS pct,
        ROUND(
          COUNT(*) FILTER (WHERE ta.status IN ('present','late','auto_present','justified'))::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
        ) AS pct_with_justified
      FROM public.training_attendance ta
      JOIN public.trainings t ON t.id = ta.training_id
      WHERE ta.player_id   = v_player_id
        AND t.season_id    = p_season_id
        AND t.deleted_at   IS NULL
    ),
    rsvp_agg AS (
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE tr.status = 'going')     AS going,
        COUNT(*) FILTER (WHERE tr.status = 'not_going') AS not_going
      FROM public.training_rsvps tr
      JOIN public.trainings t ON t.id = tr.training_id
      WHERE tr.player_id = v_player_id
        AND t.season_id  = p_season_id
        AND t.deleted_at IS NULL
    ),
    said_going_missed AS (
      SELECT COUNT(*) AS n
      FROM   public.training_rsvps   tr
      JOIN   public.training_attendance ta
               ON ta.training_id = tr.training_id AND ta.player_id = tr.player_id
      JOIN   public.trainings t ON t.id = tr.training_id
      WHERE  tr.player_id = v_player_id
        AND  t.season_id  = p_season_id
        AND  t.deleted_at IS NULL
        AND  tr.status    = 'going'
        AND  ta.status    IN ('absent','justified')
    ),
    streak_base AS (
      SELECT ta.status,
             ROW_NUMBER() OVER (ORDER BY t.date DESC) AS rn
      FROM   public.training_attendance ta
      JOIN   public.trainings t ON t.id = ta.training_id
      WHERE  ta.player_id = v_player_id
        AND  t.season_id  = p_season_id
        AND  t.deleted_at IS NULL
        AND  t.date       < CURRENT_DATE
    ),
    streak_val AS (
      SELECT CASE
        WHEN (SELECT COUNT(*) FROM streak_base) = 0 THEN 0
        ELSE COALESCE(
          (SELECT MIN(rn) - 1 FROM streak_base
            WHERE status NOT IN ('present','late','auto_present')),
          (SELECT COUNT(*) FROM streak_base)
        )::INT
      END AS streak
    ),
    game_agg AS (
      SELECT
        (SELECT COUNT(*) FROM finished_games)::INT AS total_finished,
        (SELECT COUNT(*) FROM live_games)::INT     AS total_live,
        (SELECT COUNT(*) FROM public.game_callups gc
          WHERE gc.player_id = v_player_id
            AND gc.game_id   IN (SELECT event_id FROM finished_games))::INT AS called_up,
        (SELECT COUNT(*) FROM public.game_availability ga
          WHERE ga.player_id = v_player_id
            AND ga.status    = 'available'
            AND ga.game_id   IN (SELECT event_id FROM finished_games))::INT AS available,
        (SELECT COUNT(*) FROM public.game_availability ga
          WHERE ga.player_id = v_player_id
            AND ga.status    = 'unavailable'
            AND ga.game_id   IN (SELECT event_id FROM finished_games))::INT AS unavailable,
        (SELECT COUNT(*) FROM finished_games fg
          WHERE NOT EXISTS (
            SELECT 1 FROM public.game_availability ga
            WHERE ga.player_id = v_player_id AND ga.game_id = fg.event_id
          ))::INT AS no_response,
        (SELECT COUNT(*) FROM played_games)::INT AS played,
        COALESCE((SELECT SUM(seconds_played) FROM played_games), 0)::INT / 60 AS total_minutes
    ),
    -- Por competição + tipo de jogo
    by_comp AS (
      SELECT
        fg.competition,
        fg.game_type,
        COUNT(*)                  AS total_finished,
        COUNT(lg.game_session_id) AS total_live,
        COUNT(pg.game_session_id) AS played,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM public.game_callups gc2
          WHERE gc2.player_id = v_player_id AND gc2.game_id = fg.event_id
        ) THEN 1 ELSE 0 END)::INT AS called_up
      FROM finished_games fg
      LEFT JOIN live_games   lg ON lg.game_session_id = fg.game_session_id
      LEFT JOIN played_games pg ON pg.game_session_id = fg.game_session_id
      GROUP BY fg.competition, fg.game_type
    ),
    team_training_avg AS (
      SELECT ROUND(AVG(sub.pct), 1) AS avg_pct
      FROM (
        SELECT ta2.player_id,
               ROUND(
                 COUNT(*) FILTER (WHERE ta2.status IN ('present','late','auto_present'))::NUMERIC
                 / NULLIF(COUNT(*), 0) * 100, 1
               ) AS pct
        FROM   public.training_attendance ta2
        JOIN   public.trainings t2 ON t2.id = ta2.training_id
        WHERE  t2.season_id  = p_season_id
          AND  t2.deleted_at IS NULL
        GROUP  BY ta2.player_id
        HAVING COUNT(*) > 0
      ) sub
    ),
    team_games_avg AS (
      SELECT
        CASE WHEN (SELECT COUNT(*) FROM live_games) = 0 THEN NULL
        ELSE ROUND(AVG(sub.pct), 1) END AS avg_pct
      FROM (
        SELECT p2.id AS player_id,
               ROUND(
                 COUNT(DISTINCT pgs2.game_session_id)::NUMERIC
                 / (SELECT COUNT(*) FROM live_games) * 100, 1
               ) AS pct
        FROM   public.players p2
        LEFT   JOIN public.player_game_stats pgs2
                 ON pgs2.player_id = p2.id
                AND pgs2.game_session_id IN (SELECT game_session_id FROM live_games)
        WHERE  p2.season_id = p_season_id
        GROUP  BY p2.id
      ) sub
    ),
    monthly AS (
      SELECT
        TO_CHAR(t.date, 'YYYY-MM')     AS month_key,
        EXTRACT(MONTH FROM t.date)::INT AS month_num,
        COUNT(*)                        AS training_total,
        COUNT(*) FILTER (WHERE ta.status IN ('present','late','auto_present')) AS training_present,
        ROUND(
          COUNT(*) FILTER (WHERE ta.status IN ('present','late','auto_present'))::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
        ) AS training_pct
      FROM   public.training_attendance ta
      JOIN   public.trainings t ON t.id = ta.training_id
      WHERE  ta.player_id  = v_player_id
        AND  t.season_id   = p_season_id
        AND  t.deleted_at  IS NULL
        AND  t.date        < CURRENT_DATE
      GROUP  BY TO_CHAR(t.date, 'YYYY-MM'), EXTRACT(MONTH FROM t.date)
      ORDER  BY month_key
    )
    SELECT json_build_object(
      'player_id', v_player_id,
      'training', (
        SELECT json_build_object(
          'total',                    t.total,
          'present',                  t.n_present,
          'absent',                   t.n_absent,
          'justified',                t.n_justified,
          'late',                     t.n_late,
          'auto_present',             t.n_auto_present,
          'pct',                      t.pct,
          'pct_with_justified',       t.pct_with_justified,
          'rsvp_total',               r.total,
          'rsvp_going',               r.going,
          'rsvp_not_going',           r.not_going,
          'said_going_then_absent',   s.n,
          'streak_current',           sv.streak
        )
        FROM ta_agg t, rsvp_agg r, said_going_missed s, streak_val sv
      ),
      'games', (
        SELECT json_build_object(
          'total_finished',  g.total_finished,
          'total_live',      g.total_live,
          'called_up',       g.called_up,
          'available',       g.available,
          'unavailable',     g.unavailable,
          'no_response',     g.no_response,
          'played',          g.played,
          'total_minutes',   g.total_minutes,
          'by_competition',  (SELECT COALESCE(json_agg(row_to_json(c)), '[]') FROM by_comp c)
        )
        FROM game_agg g
      ),
      'team_avg', json_build_object(
        'training_pct', (SELECT avg_pct FROM team_training_avg),
        'games_pct',    (SELECT avg_pct FROM team_games_avg)
      ),
      'monthly', (SELECT COALESCE(json_agg(row_to_json(m)), '[]') FROM monthly m)
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_player_attendance_summary(UUID) TO authenticated;

-- ─── 3. get_player_attendance_timeline ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_attendance_timeline(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM   public.players
  WHERE  user_id   = auth.uid()
    AND  season_id = p_season_id
  LIMIT 1;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM   public.players
    WHERE  user_id = auth.uid()
    ORDER  BY created_at DESC
    LIMIT  1;
  END IF;

  IF v_player_id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;

  RETURN (
    SELECT COALESCE(
      json_agg(item ORDER BY (item->>'event_date') DESC, (item->>'event_type') DESC),
      '[]'::JSON
    )
    FROM (
      -- Treinos (excluir cancelados)
      SELECT json_build_object(
        'event_type',        'training',
        'event_id',          t.id,
        'event_date',        t.date,
        'event_time',        t.start_time,
        'training_type',     t.type,
        'training_foco',     t.foco,
        'attendance_status', ta.status,
        'rsvp_status',       tr.status,
        'is_past',           t.date < CURRENT_DATE
      ) AS item
      FROM   public.trainings t
      LEFT   JOIN public.training_attendance ta
                 ON ta.training_id = t.id AND ta.player_id = v_player_id
      LEFT   JOIN public.training_rsvps tr
                 ON tr.training_id = t.id AND tr.player_id = v_player_id
      WHERE  t.season_id  = p_season_id
        AND  t.deleted_at IS NULL

      UNION ALL

      -- Jogos (excluir testes)
      SELECT json_build_object(
        'event_type',          'game',
        'event_id',            e.id,
        'event_date',          e.event_date,
        'event_time',          e.event_time,
        'opponent',            COALESCE(e.opponent, 'Adversário'),
        'competition',         e.competition,
        'game_type',           e.game_type,
        'was_called_up',       (gc.player_id IS NOT NULL),
        'availability_status', ga.status,
        'session_status',      gs.status,
        'stats_source',        gs.stats_source,
        'game_played',         (pgs.game_session_id IS NOT NULL AND gs.stats_source <> 'result_only'),
        'game_pts',            CASE WHEN gs.stats_source <> 'result_only' THEN pgs.pts ELSE NULL END,
        'game_reb',            CASE WHEN pgs.game_session_id IS NOT NULL AND gs.stats_source <> 'result_only'
                                    THEN pgs.reb_off + pgs.reb_def ELSE NULL END,
        'game_ast',            CASE WHEN gs.stats_source <> 'result_only' THEN pgs.ast ELSE NULL END,
        'game_minutes',        CASE WHEN pgs.seconds_played IS NOT NULL AND gs.stats_source <> 'result_only'
                                    THEN (pgs.seconds_played / 60)::INT ELSE NULL END,
        'is_past',             e.event_date < CURRENT_DATE
      ) AS item
      FROM   public.events e
      LEFT   JOIN public.game_sessions gs     ON gs.event_id = e.id
      LEFT   JOIN public.game_callups gc      ON gc.game_id  = e.id  AND gc.player_id = v_player_id
      LEFT   JOIN public.game_availability ga ON ga.game_id  = e.id  AND ga.player_id = v_player_id
      LEFT   JOIN public.player_game_stats pgs
                 ON pgs.game_session_id = gs.id AND pgs.player_id = v_player_id
      WHERE  e.season_id = p_season_id
        AND  e.type      = 'jogo'
        AND  e.is_test   IS NOT TRUE
    ) subq
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_player_attendance_timeline(UUID) TO authenticated;
