-- 084_club_game_filter.sql
-- Liga a temporada à equipa da liga (league_team_id) e adiciona is_club_game
-- aos eventos para filtrar jogos do CD Póvoa de forma eficiente (sem texto).
-- Actualiza get_training_game_conflicts para só devolver conflitos do CD Póvoa.
-- Aplicado em 2026-10-21 via Supabase SQL Editor.

BEGIN;

-- 1. Ligar a temporada à equipa que representa o clube na liga
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS league_team_id UUID REFERENCES league_teams(id);

UPDATE seasons
SET league_team_id = (SELECT id FROM league_teams WHERE is_our_team = true LIMIT 1)
WHERE league_team_id IS NULL;

-- 2. Boolean indexável para filtragem O(1)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_club_game BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: is_our_game=true no JSON, ou teams com "póvoa" se flag ausente
UPDATE events
SET is_club_game = TRUE
WHERE type = 'jogo'
  AND deleted_at IS NULL
  AND description IS NOT NULL
  AND description ~ '^[[:space:]]*\{'
  AND (
    (description::jsonb->>'is_our_game' = 'true')
    OR (
      description::jsonb->>'is_our_game' IS NULL
      AND (
        lower(coalesce(description::jsonb->>'home_team', '')) LIKE '%póvoa%'
        OR lower(coalesce(description::jsonb->>'away_team', '')) LIKE '%póvoa%'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_events_club_game_date
  ON events (season_id, is_club_game, event_date)
  WHERE is_club_game = TRUE AND deleted_at IS NULL;

-- 3. Actualizar função de conflitos para só contar jogos do CD Póvoa
CREATE OR REPLACE FUNCTION public.get_training_game_conflicts(p_season_id uuid)
RETURNS TABLE (
  conflict_date  date,
  training_id    uuid,
  training_time  time,
  game_id        uuid,
  game_title     text,
  game_time      time
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.event_date::date  AS conflict_date,
    t.id                AS training_id,
    t.start_time        AS training_time,
    e.id                AS game_id,
    e.title             AS game_title,
    e.event_time        AS game_time
  FROM public.trainings t
  JOIN public.events e
    ON  e.event_date::date = t.date::date
    AND e.season_id        = p_season_id
    AND e.type             = 'jogo'
    AND e.is_club_game     = TRUE
    AND e.deleted_at IS NULL
  WHERE t.season_id = p_season_id
    AND t.date      >= CURRENT_DATE
  ORDER BY conflict_date, t.start_time;
$$;

REVOKE EXECUTE ON FUNCTION public.get_training_game_conflicts(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_training_game_conflicts(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_training_game_conflicts(uuid) IS
  'Devolve pares treino/jogo (só CD Póvoa, is_club_game=TRUE) no mesmo dia para a temporada indicada.';

COMMIT;
