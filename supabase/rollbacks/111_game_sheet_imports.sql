-- Rollback manual da 111_game_sheet_imports.sql (NÃO é aplicado automaticamente).
-- Remove a importação inteligente do boletim. Os resultados oficiais (league_game_results)
-- e as estatísticas por jogador/períodos já aprovados são mantidos.

DROP FUNCTION IF EXISTS public.liga_apply_game_sheet(uuid, text, jsonb);
DROP TABLE IF EXISTS public.league_game_scoring_events;

ALTER TABLE public.league_game_results
  DROP COLUMN IF EXISTS home_unattributed_points,
  DROP COLUMN IF EXISTS away_unattributed_points,
  DROP COLUMN IF EXISTS stats_completeness;

ALTER TABLE public.league_game_player_stats DROP CONSTRAINT IF EXISTS lgps_source_check;
ALTER TABLE public.league_game_player_stats
  DROP COLUMN IF EXISTS dois_pontos,
  DROP COLUMN IF EXISTS pontos_periodo,
  DROP COLUMN IF EXISTS player_id,
  DROP COLUMN IF EXISTS source;

DROP POLICY IF EXISTS rs_update_own_pending_delegate ON public.result_submissions;
ALTER TABLE public.result_submissions DROP COLUMN IF EXISTS import_id;

DROP POLICY IF EXISTS gsi_admin_insert ON public.game_sheet_imports; -- 112
DROP TABLE IF EXISTS public.game_sheet_imports;
