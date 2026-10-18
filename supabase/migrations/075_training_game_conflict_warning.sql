-- 075_training_game_conflict_warning.sql
-- Função RPC para detectar conflitos treino/jogo no mesmo dia.
-- Usado pelo dashboard para mostrar aviso ao treinador/admin.
--
-- IMPORTANTE: Mostrar ao utilizador para revisão antes de aplicar.
-- Aplicar no Supabase SQL Editor (projeto uhszagzrhdfzpfztuati).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_training_game_conflicts(p_season_id uuid)
RETURNS TABLE (
  conflict_date  date,
  training_id    uuid,
  training_time  time,
  game_id        uuid,
  game_title     text,
  game_time      time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    ON e.event_date::date = t.date::date
   AND e.season_id        = p_season_id
   AND e.type             = 'jogo'
  WHERE t.season_id = p_season_id
    AND t.date      >= CURRENT_DATE
  ORDER BY conflict_date, t.start_time;
$$;

COMMENT ON FUNCTION public.get_training_game_conflicts(uuid) IS
  'Devolve pares treino/jogo no mesmo dia para a temporada indicada. '
  'Apenas datas futuras (>= hoje). Usado pelo dashboard para mostrar aviso.';

REVOKE EXECUTE ON FUNCTION public.get_training_game_conflicts(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_training_game_conflicts(uuid) TO authenticated;

COMMIT;
