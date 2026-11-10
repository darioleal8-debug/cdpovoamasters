-- Rollback de 120_match_documents_reconciliation.sql
-- ATENÇÃO: apaga as reconciliações, o registo de correções e as estatísticas completas.
-- Repor liga_apply_game_sheet: reaplicar a secção 6 de 111_game_sheet_imports.sql.
DROP TABLE IF EXISTS public.match_reconciliation_corrections;
DROP TABLE IF EXISTS public.match_reconciliations;
DROP INDEX IF EXISTS public.gsi_one_processing_per_event_team_doc;
DROP INDEX IF EXISTS public.gsi_event_doc_idx;
CREATE UNIQUE INDEX IF NOT EXISTS gsi_one_processing_per_event
  ON public.game_sheet_imports(event_id) WHERE status = 'processing';
DELETE FROM public.game_sheet_imports WHERE doc_type = 'pro_stats';
ALTER TABLE public.game_sheet_imports DROP CONSTRAINT IF EXISTS gsi_doc_type_check;
ALTER TABLE public.game_sheet_imports DROP COLUMN IF EXISTS doc_type, DROP COLUMN IF EXISTS stats_data, DROP COLUMN IF EXISTS page_count;
UPDATE public.league_game_player_stats SET source = 'manual' WHERE source IN ('pro_stats', 'consolidated');
ALTER TABLE public.league_game_player_stats DROP CONSTRAINT IF EXISTS lgps_source_check;
ALTER TABLE public.league_game_player_stats
  ADD CONSTRAINT lgps_source_check CHECK (source IN ('manual', 'game_sheet', 'legacy_scan'));
ALTER TABLE public.league_game_player_stats
  DROP COLUMN IF EXISTS segundos, DROP COLUMN IF EXISTS dois_pontos_tent, DROP COLUMN IF EXISTS triplos_tent,
  DROP COLUMN IF EXISTS lances_livres_tent, DROP COLUMN IF EXISTS ressaltos_of, DROP COLUMN IF EXISTS ressaltos_def,
  DROP COLUMN IF EXISTS ressaltos, DROP COLUMN IF EXISTS assistencias, DROP COLUMN IF EXISTS roubos,
  DROP COLUMN IF EXISTS perdas, DROP COLUMN IF EXISTS desarmes, DROP COLUMN IF EXISTS faltas_sofridas,
  DROP COLUMN IF EXISTS mais_menos, DROP COLUMN IF EXISTS eficiencia, DROP COLUMN IF EXISTS extra,
  DROP COLUMN IF EXISTS value_sources, DROP COLUMN IF EXISTS confidence;
