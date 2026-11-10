-- 120_match_documents_reconciliation.sql
-- Submissão de estatísticas profissionais (Tipo B) e validação cruzada das duas equipas.
--
--  1. game_sheet_imports: doc_type ('official_sheet' | 'pro_stats'), stats_data, page_count
--     + bloqueio de processamento por (jogo, equipa, tipo) em vez de por jogo
--  2. match_reconciliations: estado de validação e dados consolidados de cada jogo
--  3. match_reconciliation_corrections: auditoria das correções manuais do admin
--  4. league_game_player_stats: estatísticas completas (opcionais) + fonte/confiança
--  5. liga_apply_game_sheet(): grava as novas colunas (mesma assinatura, retrocompatível)
--
-- Aditiva e idempotente: os jogos e dados históricos continuam válidos (doc_type por omissão
-- 'official_sheet'; novas colunas de estatística são NULL = "não disponível").

-- ─── 1. Tipos de documento ───────────────────────────────────────────────────
ALTER TABLE public.game_sheet_imports
  ADD COLUMN IF NOT EXISTS doc_type   text NOT NULL DEFAULT 'official_sheet',
  ADD COLUMN IF NOT EXISTS stats_data jsonb,
  ADD COLUMN IF NOT EXISTS page_count smallint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gsi_doc_type_check') THEN
    ALTER TABLE public.game_sheet_imports
      ADD CONSTRAINT gsi_doc_type_check CHECK (doc_type IN ('official_sheet', 'pro_stats'));
  END IF;
END $$;

-- Antes: só 1 análise em curso por jogo (bloqueava a 2.ª equipa). Agora: 1 por jogo+equipa+tipo.
DROP INDEX IF EXISTS public.gsi_one_processing_per_event;
CREATE UNIQUE INDEX IF NOT EXISTS gsi_one_processing_per_event_team_doc
  ON public.game_sheet_imports(event_id, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), doc_type)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS gsi_event_doc_idx ON public.game_sheet_imports(event_id, doc_type);

-- ─── 2. Reconciliação por jogo ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_reconciliations (
  event_id       uuid        PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'pending_submission'
                   CHECK (status IN ('pending_submission','analyzing','validated','discrepancies','manual_review')),
  consolidated   jsonb,      -- jogo consolidado (resultado, parciais, jogadores com fonte de cada valor)
  discrepancies  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  math_issues    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sources        jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- documentos usados (id, equipa, tipo, estado)
  confidence     numeric(4,3),
  inputs_hash    text,       -- evita repetir a análise DeepSeek quando os documentos não mudaram
  ai_review      jsonb,      -- saída validada da análise cruzada DeepSeek
  ai_usage       jsonb,
  ai_inputs_hash text,
  overrides      jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- valores corrigidos pelo admin (caminho → valor)
  run_count      integer     NOT NULL DEFAULT 0,
  error          text,
  analyzed_at    timestamptz,
  approved_at    timestamptz,
  approved_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_reconciliations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'match_reconciliations' AND policyname = 'mr_admin_all') THEN
    CREATE POLICY mr_admin_all ON public.match_reconciliations FOR ALL TO authenticated
      USING (public.is_liga_admin()) WITH CHECK (public.is_liga_admin());
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.match_reconciliations TO authenticated;

-- ─── 3. Auditoria das correções manuais ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_reconciliation_corrections (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  field_path   text        NOT NULL,
  old_value    jsonb,
  new_value    jsonb,
  reason       text,
  corrected_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mrc_event_idx ON public.match_reconciliation_corrections(event_id, corrected_at DESC);

ALTER TABLE public.match_reconciliation_corrections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'match_reconciliation_corrections' AND policyname = 'mrc_admin_select') THEN
    CREATE POLICY mrc_admin_select ON public.match_reconciliation_corrections FOR SELECT TO authenticated
      USING (public.is_liga_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'match_reconciliation_corrections' AND policyname = 'mrc_admin_insert') THEN
    CREATE POLICY mrc_admin_insert ON public.match_reconciliation_corrections FOR INSERT TO authenticated
      WITH CHECK (public.is_liga_admin() AND corrected_by = auth.uid());
  END IF;
END $$;
-- Sem UPDATE/DELETE: o registo de correções é só de acréscimo
GRANT SELECT, INSERT ON public.match_reconciliation_corrections TO authenticated;

-- ─── 4. Estatísticas completas por jogador (todas opcionais) ─────────────────
ALTER TABLE public.league_game_player_stats
  ADD COLUMN IF NOT EXISTS segundos            integer,
  ADD COLUMN IF NOT EXISTS dois_pontos_tent    smallint,
  ADD COLUMN IF NOT EXISTS triplos_tent        smallint,
  ADD COLUMN IF NOT EXISTS lances_livres_tent  smallint,
  ADD COLUMN IF NOT EXISTS ressaltos_of        smallint,
  ADD COLUMN IF NOT EXISTS ressaltos_def       smallint,
  ADD COLUMN IF NOT EXISTS ressaltos           smallint,
  ADD COLUMN IF NOT EXISTS assistencias        smallint,
  ADD COLUMN IF NOT EXISTS roubos              smallint,
  ADD COLUMN IF NOT EXISTS perdas              smallint,
  ADD COLUMN IF NOT EXISTS desarmes            smallint,
  ADD COLUMN IF NOT EXISTS faltas_sofridas     smallint,
  ADD COLUMN IF NOT EXISTS mais_menos          smallint,
  ADD COLUMN IF NOT EXISTS eficiencia          smallint,
  ADD COLUMN IF NOT EXISTS extra               jsonb,
  ADD COLUMN IF NOT EXISTS value_sources       jsonb,
  ADD COLUMN IF NOT EXISTS confidence          numeric(4,3);

ALTER TABLE public.league_game_player_stats DROP CONSTRAINT IF EXISTS lgps_source_check;
ALTER TABLE public.league_game_player_stats
  ADD CONSTRAINT lgps_source_check CHECK (source IN ('manual', 'game_sheet', 'legacy_scan', 'pro_stats', 'consolidated'));

-- ─── 5. liga_apply_game_sheet com estatísticas completas ─────────────────────
CREATE OR REPLACE FUNCTION public.liga_apply_game_sheet(
  p_submission_id uuid,
  p_motivo        text,
  p_payload       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        public.result_submissions%ROWTYPE;
  v_event      public.events%ROWTYPE;
  v_prev       jsonb;
  v_comp_id    uuid;
  v_is_test    boolean;
  v_home       int;
  v_away       int;
  v_home_team  uuid;
  v_away_team  uuid;
BEGIN
  IF NOT (public.is_liga_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Sem permissão de admin da liga' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'motivo obrigatório' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sub FROM public.result_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submissão não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_sub.event_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogo não encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_home := coalesce((p_payload #>> '{final,home}')::int, v_sub.home_score);
  v_away := coalesce((p_payload #>> '{final,away}')::int, v_sub.away_score);
  IF v_home IS NULL OR v_away IS NULL OR v_home < 0 OR v_away < 0 THEN
    RAISE EXCEPTION 'Resultado inválido' USING ERRCODE = '22023';
  END IF;

  v_is_test := coalesce(v_event.is_test, false)
               OR coalesce(v_event.description, '') ~ '"is_test"\s*:\s*true';
  IF NOT v_is_test THEN
    SELECT id INTO v_comp_id FROM public.competitions WHERE slug = 'liga-inatel' LIMIT 1;
    v_comp_id := coalesce(v_comp_id, v_sub.competition_id);
  END IF;

  SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score)
    INTO v_prev FROM public.league_game_results WHERE event_id = v_sub.event_id;

  v_home_team := coalesce(v_sub.home_team_id, public.resolve_team_id(v_sub.home_team_name));
  v_away_team := coalesce(v_sub.away_team_id, public.resolve_team_id(v_sub.away_team_name));

  UPDATE public.result_submissions
     SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = NULL,
         home_score = v_home, away_score = v_away
   WHERE id = p_submission_id;

  INSERT INTO public.league_game_results AS r (
    event_id, competition_id, home_team_name, away_team_name, home_score, away_score,
    home_team_id, away_team_id, approved_at, approved_by, referees, overtime, source_submission_id,
    home_unattributed_points, away_unattributed_points, stats_completeness
  ) VALUES (
    v_sub.event_id, v_comp_id, v_sub.home_team_name, v_sub.away_team_name, v_home, v_away,
    v_home_team, v_away_team, now(), auth.uid(),
    CASE WHEN jsonb_array_length(coalesce(p_payload->'referees', '[]'::jsonb)) > 0
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'referees')) END,
    coalesce((p_payload->>'overtime')::boolean, false), p_submission_id,
    (p_payload #>> '{unattributed,home}')::smallint, (p_payload #>> '{unattributed,away}')::smallint,
    p_payload->>'completeness'
  )
  ON CONFLICT (event_id) DO UPDATE SET
    competition_id = EXCLUDED.competition_id,
    home_team_name = EXCLUDED.home_team_name, away_team_name = EXCLUDED.away_team_name,
    home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score,
    home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id,
    approved_at = EXCLUDED.approved_at, approved_by = EXCLUDED.approved_by,
    referees = EXCLUDED.referees, overtime = EXCLUDED.overtime,
    source_submission_id = EXCLUDED.source_submission_id,
    home_unattributed_points = EXCLUDED.home_unattributed_points,
    away_unattributed_points = EXCLUDED.away_unattributed_points,
    stats_completeness = EXCLUDED.stats_completeness;

  IF jsonb_typeof(p_payload->'periods') = 'array' THEN
    DELETE FROM public.league_game_periods WHERE event_id = v_sub.event_id;
    INSERT INTO public.league_game_periods (event_id, periodo, home_points, away_points)
    SELECT v_sub.event_id, (p->>'periodo')::smallint, (p->>'home_points')::smallint, (p->>'away_points')::smallint
      FROM jsonb_array_elements(p_payload->'periods') p;
  END IF;

  IF jsonb_typeof(p_payload->'players') = 'array' THEN
    DELETE FROM public.league_game_player_stats WHERE event_id = v_sub.event_id;
    INSERT INTO public.league_game_player_stats (
      event_id, team_id, side, numero, nome, pontos, dois_pontos, triplos, lances_livres, faltas,
      pontos_periodo, player_id, source,
      segundos, dois_pontos_tent, triplos_tent, lances_livres_tent, ressaltos_of, ressaltos_def,
      ressaltos, assistencias, roubos, perdas, desarmes, faltas_sofridas, mais_menos, eficiencia,
      extra, value_sources, confidence
    )
    SELECT v_sub.event_id,
           CASE WHEN j->>'side' = 'home' THEN v_home_team ELSE v_away_team END,
           j->>'side', (j->>'numero')::smallint, coalesce(nullif(j->>'nome', ''), 'Jogador'),
           coalesce((j->>'pontos')::smallint, 0), coalesce((j->>'dois_pontos')::smallint, 0),
           coalesce((j->>'triplos')::smallint, 0), coalesce((j->>'lances_livres')::smallint, 0),
           coalesce((j->>'faltas')::smallint, 0), j->'pontos_periodo',
           nullif(j->>'player_id', '')::uuid, coalesce(j->>'source', 'manual'),
           (j->>'segundos')::int, (j->>'dois_pontos_tent')::smallint, (j->>'triplos_tent')::smallint,
           (j->>'lances_livres_tent')::smallint, (j->>'ressaltos_of')::smallint, (j->>'ressaltos_def')::smallint,
           (j->>'ressaltos')::smallint, (j->>'assistencias')::smallint, (j->>'roubos')::smallint,
           (j->>'perdas')::smallint, (j->>'desarmes')::smallint, (j->>'faltas_sofridas')::smallint,
           (j->>'mais_menos')::smallint, (j->>'eficiencia')::smallint,
           j->'extra', j->'value_sources', (j->>'confidence')::numeric
      FROM jsonb_array_elements(p_payload->'players') j;
  END IF;

  IF jsonb_typeof(p_payload->'scoring_events') = 'array' THEN
    DELETE FROM public.league_game_scoring_events WHERE event_id = v_sub.event_id;
    INSERT INTO public.league_game_scoring_events (
      event_id, side, seq, periodo, cumulative, points, numero, player_name, attributed
    )
    SELECT v_sub.event_id, s->>'side', (s->>'seq')::smallint, (s->>'periodo')::smallint,
           (s->>'cumulative')::smallint, (s->>'points')::smallint, (s->>'numero')::smallint,
           s->>'player_name', coalesce((s->>'attributed')::boolean, false)
      FROM jsonb_array_elements(p_payload->'scoring_events') s;
  END IF;

  IF v_sub.import_id IS NOT NULL THEN
    UPDATE public.game_sheet_imports SET status = 'published', updated_at = now()
     WHERE id = v_sub.import_id;
  END IF;
  -- Documentos adicionais usados na consolidação (folha da outra equipa, estatísticas profissionais)
  IF jsonb_typeof(p_payload->'import_ids') = 'array' THEN
    UPDATE public.game_sheet_imports SET status = 'published', updated_at = now()
     WHERE event_id = v_sub.event_id
       AND status = 'confirmed'
       AND id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(p_payload->'import_ids') x);
  END IF;
  -- Aprovação a partir da validação cruzada: regista quem aprovou
  UPDATE public.match_reconciliations
     SET approved_at = now(), approved_by = auth.uid(), updated_at = now()
   WHERE event_id = v_sub.event_id AND p_payload ? 'reconciliation';

  INSERT INTO public.liga_resultado_audit (jogo_id, alterado_por, valor_antigo, valor_novo, motivo)
  VALUES (
    v_sub.event_id, auth.uid(), v_prev,
    jsonb_build_object('home_score', v_home, 'away_score', v_away,
                       'source', 'submission:' || p_submission_id,
                       'import_id', v_sub.import_id, 'is_test', v_is_test,
                       'completeness', p_payload->>'completeness',
                       'reconciliation', p_payload->'reconciliation'),
    trim(p_motivo)
  );

  RETURN jsonb_build_object('event_id', v_sub.event_id, 'is_test', v_is_test,
                            'previous', v_prev, 'home_score', v_home, 'away_score', v_away);
END;
$$;

REVOKE ALL ON FUNCTION public.liga_apply_game_sheet(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_apply_game_sheet(uuid, text, jsonb) TO authenticated;
