-- 111_game_sheet_imports.sql
-- Importação inteligente do boletim de jogo (folha INATEL/FIBA) com revisão humana.
--
--  1. game_sheet_imports        — rascunho de cada leitura (estado, dados, validação, custos, correções)
--  2. result_submissions.import_id
--  3. league_game_player_stats  — 2 pontos, pontos por período, jogador HoopHub, origem
--  4. league_game_results       — pontos por atribuir e completude das estatísticas
--  5. league_game_scoring_events — marcha do resultado validada
--  6. liga_apply_game_sheet()   — aprovação atómica (uma transação) usada pelo admin da liga
--
-- Idempotente. Rollback em 111_game_sheet_imports_rollback.sql.

-- ─── 1. game_sheet_imports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_sheet_imports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id            uuid        REFERENCES public.league_teams(id) ON DELETE SET NULL,
  created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status             text        NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','needs_review','ready_to_confirm','confirmed','published','failed')),
  image_path         text,
  image_sha256       text,
  image_mime         text,
  schema_version     smallint    NOT NULL DEFAULT 1,
  processing_version text,
  model              text,
  extraction_raw     jsonb,      -- saída do modelo já validada pelo esquema (nunca a resposta bruta)
  sheet_data         jsonb,      -- dados canónicos editáveis
  validation         jsonb,      -- resultado do motor determinístico
  ai_usage           jsonb,      -- duração, tokens, n.º de chamadas
  analysis_count     smallint    NOT NULL DEFAULT 0,
  corrections        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error              text,
  submission_id      uuid        REFERENCES public.result_submissions(id) ON DELETE SET NULL,
  confirmed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gsi_event_idx ON public.game_sheet_imports(event_id);
CREATE INDEX IF NOT EXISTS gsi_team_idx  ON public.game_sheet_imports(team_id);
-- Proteção contra importações simultâneas do mesmo jogo
CREATE UNIQUE INDEX IF NOT EXISTS gsi_one_processing_per_event
  ON public.game_sheet_imports(event_id) WHERE status = 'processing';
-- Idempotência: a mesma imagem para o mesmo jogo reaproveita o rascunho
CREATE UNIQUE INDEX IF NOT EXISTS gsi_event_image_unique
  ON public.game_sheet_imports(event_id, image_sha256)
  WHERE image_sha256 IS NOT NULL AND status <> 'failed';

ALTER TABLE public.game_sheet_imports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Delegado: vê e gere as importações da sua equipa
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sheet_imports' AND policyname = 'gsi_team_select') THEN
    CREATE POLICY gsi_team_select ON public.game_sheet_imports FOR SELECT TO authenticated
      USING (team_id IN (SELECT team_id FROM public.league_team_members WHERE user_id = auth.uid())
             OR public.is_liga_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sheet_imports' AND policyname = 'gsi_team_insert') THEN
    CREATE POLICY gsi_team_insert ON public.game_sheet_imports FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid()
                  AND team_id IN (SELECT team_id FROM public.league_team_members WHERE user_id = auth.uid())
                  AND status IN ('processing','needs_review','ready_to_confirm','failed'));
  END IF;
  -- Delegado não pode marcar 'published' (só a aprovação do admin, via liga_apply_game_sheet)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sheet_imports' AND policyname = 'gsi_team_update') THEN
    CREATE POLICY gsi_team_update ON public.game_sheet_imports FOR UPDATE TO authenticated
      USING ((team_id IN (SELECT team_id FROM public.league_team_members WHERE user_id = auth.uid())
              AND status <> 'published')
             OR public.is_liga_admin())
      WITH CHECK ((team_id IN (SELECT team_id FROM public.league_team_members WHERE user_id = auth.uid())
                   AND status <> 'published')
                  OR public.is_liga_admin());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.game_sheet_imports TO authenticated;

-- ─── 2. Ligação submissão ↔ importação ───────────────────────────────────────
ALTER TABLE public.result_submissions
  ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES public.game_sheet_imports(id) ON DELETE SET NULL;

-- O delegado atualiza a SUA submissão pendente ao reconfirmar uma importação
-- (sem esta política o UPDATE com a sessão do delegado não afetava nenhuma linha).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'result_submissions' AND policyname = 'rs_update_own_pending_delegate') THEN
    CREATE POLICY rs_update_own_pending_delegate ON public.result_submissions FOR UPDATE TO authenticated
      USING (status = 'pending' AND submitted_by_user_id = auth.uid())
      WITH CHECK (status = 'pending' AND submitted_by_user_id = auth.uid());
  END IF;
END $$;

-- ─── 3. Estatísticas por jogador ─────────────────────────────────────────────
ALTER TABLE public.league_game_player_stats
  ADD COLUMN IF NOT EXISTS dois_pontos     smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pontos_periodo  jsonb,
  ADD COLUMN IF NOT EXISTS player_id       uuid,
  ADD COLUMN IF NOT EXISTS source          text NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lgps_source_check') THEN
    ALTER TABLE public.league_game_player_stats
      ADD CONSTRAINT lgps_source_check CHECK (source IN ('manual', 'game_sheet', 'legacy_scan'));
  END IF;
END $$;

-- ─── 4. Resultado: pontos por atribuir e completude ──────────────────────────
ALTER TABLE public.league_game_results
  ADD COLUMN IF NOT EXISTS home_unattributed_points smallint,
  ADD COLUMN IF NOT EXISTS away_unattributed_points smallint,
  ADD COLUMN IF NOT EXISTS stats_completeness       text;

-- ─── 5. Marcha do resultado validada ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_game_scoring_events (
  id          uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid     NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  side        text     NOT NULL CHECK (side IN ('home', 'away')),
  seq         smallint NOT NULL,
  periodo     smallint,
  cumulative  smallint NOT NULL CHECK (cumulative >= 0),
  points      smallint NOT NULL CHECK (points > 0),
  numero      smallint,
  player_name text,
  attributed  boolean  NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, side, seq)
);
CREATE INDEX IF NOT EXISTS lgse_event_idx ON public.league_game_scoring_events(event_id);

ALTER TABLE public.league_game_scoring_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'league_game_scoring_events' AND policyname = 'lgse_select_public') THEN
    CREATE POLICY lgse_select_public ON public.league_game_scoring_events FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
GRANT SELECT ON public.league_game_scoring_events TO anon, authenticated;

-- ─── 6. Aplicação atómica do resultado aprovado ──────────────────────────────
-- Chamada pelo admin da liga (sessão própria, não service role): valida a permissão,
-- aplica TUDO numa transação e regista auditoria. Reaprovar substitui os dados do jogo
-- (sem duplicações).
--
-- p_payload: { final:{home,away}, overtime, referees[], unattributed:{home,away}, completeness,
--              periods:[{periodo,home_points,away_points}], players:[...], scoring_events:[...] }
-- periods / players / scoring_events: array → substitui; ausente/null → mantém o existente.
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

  -- Bloqueia a submissão (evita aprovações concorrentes)
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

  -- Jogos de teste nunca entram na classificação: ficam sem competition_id
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

  -- Substituição integral dos dados derivados presentes no payload (idempotente; sem duplicar
  -- ao reaprovar). Uma chave ausente/null mantém os dados existentes (submissões antigas sem
  -- estatísticas não apagam estatísticas já gravadas).
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
      pontos_periodo, player_id, source
    )
    SELECT v_sub.event_id,
           CASE WHEN j->>'side' = 'home' THEN v_home_team ELSE v_away_team END,
           j->>'side', (j->>'numero')::smallint, coalesce(nullif(j->>'nome', ''), 'Jogador'),
           coalesce((j->>'pontos')::smallint, 0), coalesce((j->>'dois_pontos')::smallint, 0),
           coalesce((j->>'triplos')::smallint, 0), coalesce((j->>'lances_livres')::smallint, 0),
           coalesce((j->>'faltas')::smallint, 0), j->'pontos_periodo',
           nullif(j->>'player_id', '')::uuid, coalesce(j->>'source', 'manual')
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

  INSERT INTO public.liga_resultado_audit (jogo_id, alterado_por, valor_antigo, valor_novo, motivo)
  VALUES (
    v_sub.event_id, auth.uid(), v_prev,
    jsonb_build_object('home_score', v_home, 'away_score', v_away,
                       'source', 'submission:' || p_submission_id,
                       'import_id', v_sub.import_id, 'is_test', v_is_test,
                       'completeness', p_payload->>'completeness'),
    trim(p_motivo)
  );

  RETURN jsonb_build_object('event_id', v_sub.event_id, 'is_test', v_is_test,
                            'previous', v_prev, 'home_score', v_home, 'away_score', v_away);
END;
$$;

REVOKE ALL ON FUNCTION public.liga_apply_game_sheet(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_apply_game_sheet(uuid, text, jsonb) TO authenticated;
