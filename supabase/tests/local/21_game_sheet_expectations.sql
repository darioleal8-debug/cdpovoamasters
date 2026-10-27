-- Expectativas da migração 111 (importação do boletim). Corre depois de 20_stub + 111.
CREATE TABLE public._results (id serial, test text, ok boolean, detail text);
GRANT ALL ON public._results TO authenticated; GRANT USAGE ON SEQUENCE public._results_id_seq TO authenticated;

INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@x'),
  ('00000000-0000-0000-0000-00000000000d', 'delegado@x'),
  ('00000000-0000-0000-0000-00000000000e', 'outro@x');
INSERT INTO public.liga_admins VALUES ('00000000-0000-0000-0000-00000000000a');
INSERT INTO public.competitions (id, slug) VALUES ('00000000-0000-0000-0000-0000000000c1', 'liga-inatel');
INSERT INTO public.league_teams (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'PowerTogether'),
  ('00000000-0000-0000-0000-0000000000f2', 'Matosinhos Basket');
INSERT INTO public.league_team_members (user_id, team_id) VALUES
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000f2');
INSERT INTO public.events (id, description, is_test) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '{"home_team":"PowerTogether"}', false),
  ('00000000-0000-0000-0000-0000000000e2', '{"is_test": true}', false);

INSERT INTO public.game_sheet_imports (id, event_id, team_id, created_by, status)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000d', 'confirmed');
INSERT INTO public.result_submissions (id, event_id, home_team_name, away_team_name, home_score, away_score, import_id, submitted_by_user_id)
VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'PowerTogether', 'Matosinhos Basket', 53, 55,
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e2', 'PowerTogether', 'Matosinhos Basket', 60, 50,
   NULL, '00000000-0000-0000-0000-00000000000d');

CREATE TEMP TABLE payload AS SELECT '{
  "final": {"home": 53, "away": 55}, "overtime": false, "referees": ["Árbitro 1"],
  "unattributed": {"home": 0, "away": 2}, "completeness": "partial",
  "periods": [{"periodo":1,"home_points":21,"away_points":15},{"periodo":2,"home_points":11,"away_points":11},
              {"periodo":3,"home_points":15,"away_points":12},{"periodo":4,"home_points":6,"away_points":17}],
  "players": [{"side":"home","numero":7,"nome":"A","pontos":53,"dois_pontos":20,"triplos":3,"lances_livres":4,"faltas":2,"pontos_periodo":{"1":21},"player_id":null,"source":"game_sheet"},
              {"side":"away","numero":10,"nome":"B","pontos":53,"dois_pontos":25,"triplos":1,"lances_livres":0,"faltas":1,"pontos_periodo":{},"player_id":null,"source":"game_sheet"}],
  "scoring_events": [{"side":"home","seq":0,"periodo":1,"cumulative":2,"points":2,"numero":7,"player_name":"A","attributed":true},
                     {"side":"away","seq":0,"periodo":1,"cumulative":3,"points":3,"numero":null,"player_name":null,"attributed":false}]
}'::jsonb AS p;
GRANT SELECT ON payload TO authenticated;

-- 1. Delegado não pode aprovar
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
DO $$ BEGIN
  PERFORM public.liga_apply_game_sheet('00000000-0000-0000-0000-0000000000b1', 'm', (SELECT p FROM payload));
  INSERT INTO public._results (test, ok, detail) VALUES ('delegado_nao_aprova', false, 'aprovou sem permissão');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO public._results (test, ok, detail) VALUES ('delegado_nao_aprova', true, 'recusado');
END $$;

-- 2. Delegado vê a importação da sua equipa mas não a de outra equipa
INSERT INTO public._results (test, ok, detail)
SELECT 'delegado_ve_propria', count(*) = 1, count(*)::text FROM public.game_sheet_imports;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
INSERT INTO public._results (test, ok, detail)
SELECT 'outra_equipa_nao_ve', count(*) = 0, count(*)::text FROM public.game_sheet_imports;
-- e não consegue inserir importação para outra equipa
DO $$ BEGIN
  INSERT INTO public.game_sheet_imports (event_id, team_id, created_by)
  VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000e');
  INSERT INTO public._results (test, ok, detail) VALUES ('insert_outra_equipa', false, 'inseriu');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO public._results (test, ok, detail) VALUES ('insert_outra_equipa', true, 'RLS bloqueou');
END $$;

-- 3. Admin aprova: tudo gravado numa transação
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
SELECT public.liga_apply_game_sheet('00000000-0000-0000-0000-0000000000b1', 'boletim validado', (SELECT p FROM payload));
RESET ROLE;
INSERT INTO public._results (test, ok, detail)
SELECT 'resultado_aplicado', home_score = 53 AND away_score = 55
       AND competition_id = '00000000-0000-0000-0000-0000000000c1' AND away_unattributed_points = 2
       AND home_team_id = '00000000-0000-0000-0000-0000000000f1' AND stats_completeness = 'partial',
       home_score || '-' || away_score
  FROM public.league_game_results WHERE event_id = '00000000-0000-0000-0000-0000000000e1';
INSERT INTO public._results (test, ok, detail)
SELECT 'parciais_4', count(*) = 4 AND sum(home_points) = 53 AND sum(away_points) = 55, count(*)::text
  FROM public.league_game_periods WHERE event_id = '00000000-0000-0000-0000-0000000000e1';
INSERT INTO public._results (test, ok, detail)
SELECT 'import_published', status = 'published', status FROM public.game_sheet_imports WHERE id = '00000000-0000-0000-0000-0000000000a1';
INSERT INTO public._results (test, ok, detail)
SELECT 'submissao_aprovada', status = 'approved', status FROM public.result_submissions WHERE id = '00000000-0000-0000-0000-0000000000b1';

-- 4. Reaprovação (alteração de resultado publicado) não duplica e fica auditada
SET ROLE authenticated;
SELECT public.liga_apply_game_sheet('00000000-0000-0000-0000-0000000000b1', 'correção',
  jsonb_set((SELECT p FROM payload), '{final,away}', '56'));
RESET ROLE;
INSERT INTO public._results (test, ok, detail)
SELECT 'reaprovacao_sem_duplicados',
       (SELECT count(*) FROM public.league_game_player_stats WHERE event_id = '00000000-0000-0000-0000-0000000000e1') = 2
       AND (SELECT count(*) FROM public.league_game_scoring_events WHERE event_id = '00000000-0000-0000-0000-0000000000e1') = 2
       AND (SELECT away_score FROM public.league_game_results WHERE event_id = '00000000-0000-0000-0000-0000000000e1') = 56,
       'ok';
INSERT INTO public._results (test, ok, detail)
SELECT 'auditoria_valor_antigo', count(*) = 2 AND bool_or(valor_antigo->>'away_score' = '55'), count(*)::text
  FROM public.liga_resultado_audit WHERE jogo_id = '00000000-0000-0000-0000-0000000000e1';

-- 5. Jogo de teste não entra na classificação (competition_id NULL)
SET ROLE authenticated;
SELECT public.liga_apply_game_sheet('00000000-0000-0000-0000-0000000000b2', 'teste',
  '{"final":{"home":60,"away":50},"periods":[],"players":[],"scoring_events":[]}'::jsonb);
RESET ROLE;
INSERT INTO public._results (test, ok, detail)
SELECT 'jogo_teste_sem_competicao', competition_id IS NULL, coalesce(competition_id::text, 'null')
  FROM public.league_game_results WHERE event_id = '00000000-0000-0000-0000-0000000000e2';

-- 6. Falha a meio da gravação → nada fica gravado (transação)
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.liga_apply_game_sheet('00000000-0000-0000-0000-0000000000b1', 'falha',
    jsonb_set((SELECT p FROM payload), '{scoring_events}',
      '[{"side":"home","seq":0,"cumulative":2,"points":-1}]'::jsonb));
  INSERT INTO public._results (test, ok, detail) VALUES ('rollback_em_falha', false, 'não falhou');
EXCEPTION WHEN check_violation THEN
  INSERT INTO public._results (test, ok, detail)
  SELECT 'rollback_em_falha',
         (SELECT away_score FROM public.league_game_results WHERE event_id = '00000000-0000-0000-0000-0000000000e1') = 56
         AND (SELECT count(*) FROM public.league_game_player_stats WHERE event_id = '00000000-0000-0000-0000-0000000000e1') = 2,
         'estado anterior preservado';
END $$;
RESET ROLE;

-- 7. Submissão antiga sem estatísticas (payload sem players) não apaga estatísticas existentes
SET ROLE authenticated;
SELECT public.liga_apply_game_sheet('00000000-0000-0000-0000-0000000000b1', 'legado',
  '{"final":{"home":53,"away":56}}'::jsonb);
RESET ROLE;
INSERT INTO public._results (test, ok, detail)
SELECT 'legado_mantem_stats', count(*) = 2, count(*)::text
  FROM public.league_game_player_stats WHERE event_id = '00000000-0000-0000-0000-0000000000e1';
