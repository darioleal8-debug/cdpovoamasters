-- 139_taca_liga_inatel.sql
-- Taça da Liga INATEL 2026/27 — competição PRÓPRIA, separada da Liga INATEL.
--
--  * competitions: nova linha 'Taça da Liga INATEL' (competition_key = 'Taça')
--  * events: 14 jogos (competition = 'Taça'): 7 agendados (1ª eliminatória) + 7 por definir
--    (quartos, meias-finais, final) cujas equipas são "Vencedor Taça N" até haver resultado
--  * league_game_results.competition_id passa a seguir a competição do EVENTO (antes estava
--    fixo na Liga) — sem isto, um resultado da Taça entrava na classificação da Liga
--  * triggers: o vencedor avança sozinho para o jogo seguinte; na Taça não há empates
--
-- Os marcadores usam "Vencedor Taça N" e o campo taca_num (nunca jogo_num / "Vencedor Jogo N"),
-- para a lógica antiga de propagação da Liga não tocar na Taça.
--
-- Fonte: "Calendário de jogos · Taça de Basquetebol INATEL Porto" (provisório).
-- Nota: no documento original o jogo Taça 11 diz "Vencedor jogo 5" (repetido do Taça 10);
-- só pode ser o vencedor do Taça 7 (única 1ª eliminatória por encaixar) — usado aqui.

-- ─── 1. Competição + equipas ──────────────────────────────────────────────────
DO $$
DECLARE
  v_liga_comp  uuid;
  v_season     uuid;
  v_comp       uuid;
  v_povoa_team uuid;
  v_povoa_club uuid;
BEGIN
  SELECT id, season_id INTO v_liga_comp, v_season
    FROM public.competitions WHERE slug = 'liga-inatel';
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'Liga INATEL sem época associada — não é possível criar a Taça';
  END IF;

  INSERT INTO public.competitions (name, slug, short_name, competition_key, season_id, is_public, description)
  VALUES ('Taça da Liga INATEL', 'taca-liga-inatel', 'TAÇA', 'Taça', v_season, true,
          'Taça de Basquetebol INATEL Porto: eliminatórias a eliminar (calendário provisório). Competição independente da Liga INATEL.')
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, short_name = EXCLUDED.short_name,
    competition_key = EXCLUDED.competition_key, season_id = EXCLUDED.season_id,
    description = EXCLUDED.description, updated_at = now()
  RETURNING id INTO v_comp;

  -- Mesmas equipas da Liga (as que estão ativas na época)
  INSERT INTO public.season_teams (competition_id, team_id, active, series)
  SELECT v_comp, st.team_id, true, NULL
    FROM public.season_teams st
   WHERE st.competition_id = v_liga_comp AND st.active
  ON CONFLICT (competition_id, team_id) DO NOTHING;

  SELECT id INTO v_povoa_team FROM public.league_teams WHERE is_our_team LIMIT 1;
  SELECT id INTO v_povoa_club FROM public.clubs WHERE league_team_id = v_povoa_team LIMIT 1;

  -- ─── 2. Jogos ──────────────────────────────────────────────────────────────
  -- n, ronda, nome da ronda, casa, fora, data, hora, pavilhão, local,
  -- origem casa (taca_num), origem fora (taca_num), data por confirmar, hora por confirmar, nota da data
  INSERT INTO public.events
    (season_id, type, title, location, event_date, event_time, opponent, description,
     competition, game_type, is_club_game, club_id)
  SELECT
    v_season, 'jogo',
    'Taça ' || g.n || ' · ' || g.home || ' vs ' || g.away,
    coalesce(g.venue || CASE WHEN g.loc IS NOT NULL THEN ' — ' || g.loc ELSE '' END, 'Pavilhão a definir'),
    g.d::date, g.t::time,
    CASE WHEN g.home = 'CD Póvoa' THEN g.away WHEN g.away = 'CD Póvoa' THEN g.home ELSE g.away END,
    jsonb_strip_nulls(jsonb_build_object(
      'competition', 'Taça',
      'taca_num', g.n,
      'round', g.rnd,
      'round_name', g.rnd_name,
      'home_team', g.home,
      'away_team', g.away,
      'pavilion', g.venue,
      'locality', g.loc,
      'is_home', (g.home = 'CD Póvoa'),
      'home_source', CASE WHEN g.hs IS NOT NULL THEN jsonb_build_object('taca_num', g.hs) END,
      'away_source', CASE WHEN g.aws IS NOT NULL THEN jsonb_build_object('taca_num', g.aws) END,
      'date_tbc', g.date_tbc,
      'time_tbc', g.time_tbc,
      'venue_tbc', (g.venue IS NULL),
      'date_note', g.date_note
    ))::text,
    'Taça', 'official',
    (g.home = 'CD Póvoa' OR g.away = 'CD Póvoa'),
    CASE WHEN (g.home = 'CD Póvoa' OR g.away = 'CD Póvoa') THEN v_povoa_club END
  FROM (VALUES
    -- 1ª Eliminatória (agendada)
    (1,  1, '1ª Eliminatória', 'Barca BC',            'CD Póvoa',                      '2026-11-28', '19:00', 'Pavilhão Municipal Ponte da Barca',                  'P.Barca-V.Castelo',       NULL::int, NULL::int, false, false, NULL),
    (2,  1, '1ª Eliminatória', 'NCR Valongo',         'Powertogether Associação',      '2026-11-24', '21:30', 'Pavilhão da Escola Básica Vallis Longus',            'Valongo',                 NULL, NULL, false, false, NULL),
    (3,  1, '1ª Eliminatória', 'BC Barcelos',         'Matosinhos Basket CA',          '2026-11-27', '22:30', 'Pav. Desportivo Adães',                              'Adães-Barcelos',          NULL, NULL, false, false, NULL),
    (4,  1, '1ª Eliminatória', 'Coral Fides OV',      'CBF Felgueiras BAD',            '2026-11-26', '22:15', 'Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar',     'Gondomar',                NULL, NULL, false, false, NULL),
    (5,  1, '1ª Eliminatória', 'GD André Soares',     'UAA Aroso',                     '2026-11-25', '22:15', 'Pav. Maximinos',                                     'Braga',                   NULL, NULL, false, false, NULL),
    (6,  1, '1ª Eliminatória', 'Enesse BC',           'USC Paredes',                   '2026-11-27', '21:00', 'Pav. Municipal Prof. António Costeira',              'Oliv. Azeméis',           NULL, NULL, false, false, NULL),
    (7,  1, '1ª Eliminatória', 'Famalicense AC',      'União Afuradense BelticBasket', '2026-11-25', '22:15', 'Complexo Desportivo do Vale de São Cosme',           'S.Cosme-Famalicão',       NULL, NULL, false, false, NULL),
    -- 2ª Eliminatória · Quartos de final (25/01/2027) — hora e pavilhão por definir
    (8,  2, '2ª Eliminatória · Quartos de final', 'Vencedor Taça 1', 'Vencedor Taça 2',        '2027-01-25', '00:00', NULL, NULL, 1, 2, false, true, NULL),
    (9,  2, '2ª Eliminatória · Quartos de final', 'Vencedor Taça 3', 'Vencedor Taça 4',        '2027-01-25', '00:00', NULL, NULL, 3, 4, false, true, NULL),
    (10, 2, '2ª Eliminatória · Quartos de final', 'Vencedor Taça 5', 'Vencedor Taça 6',        '2027-01-25', '00:00', NULL, NULL, 5, 6, false, true, NULL),
    (11, 2, '2ª Eliminatória · Quartos de final', 'Vencedor Taça 7', 'A Portuguesa de Leça FC', '2027-01-25', '00:00', NULL, NULL, 7, NULL, false, true, NULL),
    -- 3ª Eliminatória · Meias-finais (22/03/2027)
    (12, 3, '3ª Eliminatória · Meias-finais', 'Vencedor Taça 8',  'Vencedor Taça 9',  '2027-03-22', '00:00', NULL, NULL, 8, 9,   false, true, NULL),
    (13, 3, '3ª Eliminatória · Meias-finais', 'Vencedor Taça 10', 'Vencedor Taça 11', '2027-03-22', '00:00', NULL, NULL, 10, 11, false, true, NULL),
    -- 4ª Eliminatória · Final (22 ou 23 de maio, pavilhão neutro)
    (14, 4, '4ª Eliminatória · Final', 'Vencedor Taça 12', 'Vencedor Taça 13', '2027-05-22', '00:00', NULL, NULL, 12, 13, true, true, '22 ou 23 de maio de 2027 · pavilhão neutro')
  ) AS g(n, rnd, rnd_name, home, away, d, t, venue, loc, hs, aws, date_tbc, time_tbc, date_note)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.competition = 'Taça' AND e.season_id = v_season AND e.type = 'jogo'
       AND e.description IS NOT NULL
       AND (e.description::jsonb ->> 'taca_num')::int = g.n
  );
END $$;

-- ─── 3. Resultados: competição segue o evento (Liga ou Taça) ─────────────────
-- liga_apply_game_sheet tinha a competição fixa em 'liga-inatel'.
DO $$
DECLARE
  v_def text;
  v_old text := E'SELECT id INTO v_comp_id FROM public.competitions WHERE slug = ''liga-inatel'' LIMIT 1;';
  v_new text := E'SELECT id INTO v_comp_id FROM public.competitions
     WHERE competition_key = coalesce(v_event.competition, ''Liga'')
       AND (season_id = v_event.season_id OR season_id IS NULL)
     ORDER BY (season_id = v_event.season_id) DESC NULLS LAST LIMIT 1;
    IF v_comp_id IS NULL THEN
      SELECT id INTO v_comp_id FROM public.competitions WHERE slug = ''liga-inatel'' LIMIT 1;
    END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.proname = 'liga_apply_game_sheet' AND p.pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN RAISE EXCEPTION 'liga_apply_game_sheet não encontrada'; END IF;
  IF position('competition_key = coalesce(v_event.competition' in v_def) > 0 THEN
    RETURN; -- já aplicado
  END IF;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'liga_apply_game_sheet mudou: ajustar esta migração';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- ─── 4. Avanço automático dos vencedores (só Taça) ───────────────────────────
CREATE OR REPLACE FUNCTION public.taca_recompute_bracket(p_season uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         record;
  meta      jsonb;
  side      text;
  src       int;
  v_name    text;
  v_home    text;
  v_away    text;
  v_ours    boolean;
  v_changed boolean;
  v_our     text;
  v_our_id  uuid;
  v_club    uuid;
BEGIN
  SELECT id, name INTO v_our_id, v_our FROM public.league_teams WHERE is_our_team LIMIT 1;
  SELECT id INTO v_club FROM public.clubs WHERE league_team_id = v_our_id LIMIT 1;

  FOR r IN
    SELECT e.id, e.description::jsonb AS meta
      FROM public.events e
     WHERE e.competition = 'Taça' AND e.season_id = p_season AND e.type = 'jogo'
       AND e.deleted_at IS NULL AND e.description IS NOT NULL
       AND (e.description::jsonb ? 'home_source' OR e.description::jsonb ? 'away_source')
     ORDER BY (e.description::jsonb ->> 'round')::int, (e.description::jsonb ->> 'taca_num')::int
  LOOP
    -- Jogo já com resultado: as equipas ficam como jogaram
    IF EXISTS (SELECT 1 FROM public.league_game_results WHERE event_id = r.id) THEN CONTINUE; END IF;

    meta := r.meta;
    v_changed := false;

    FOREACH side IN ARRAY ARRAY['home', 'away'] LOOP
      IF meta ? (side || '_source') THEN
        src := (meta -> (side || '_source') ->> 'taca_num')::int;
        v_name := NULL;
        SELECT CASE WHEN lgr.home_score > lgr.away_score THEN lgr.home_team_name
                    WHEN lgr.home_score < lgr.away_score THEN lgr.away_team_name END
          INTO v_name
          FROM public.events s
          JOIN public.league_game_results lgr ON lgr.event_id = s.id
         WHERE s.competition = 'Taça' AND s.season_id = p_season AND s.deleted_at IS NULL
           AND s.description IS NOT NULL
           AND (s.description::jsonb ->> 'taca_num')::int = src
         LIMIT 1;
        v_name := coalesce(v_name, 'Vencedor Taça ' || src);
        IF meta ->> (side || '_team') IS DISTINCT FROM v_name THEN
          meta := jsonb_set(meta, ARRAY[side || '_team'], to_jsonb(v_name));
          v_changed := true;
        END IF;
      END IF;
    END LOOP;

    IF v_changed THEN
      v_home := meta ->> 'home_team';
      v_away := meta ->> 'away_team';
      v_ours := (v_our IS NOT NULL AND (v_home = v_our OR v_away = v_our));
      meta := jsonb_set(meta, '{is_home}', to_jsonb(coalesce(v_home = v_our, false)));

      UPDATE public.events e SET
        description  = meta::text,
        title        = 'Taça ' || (meta ->> 'taca_num') || ' · ' || v_home || ' vs ' || v_away,
        opponent     = CASE WHEN v_home = v_our THEN v_away WHEN v_away = v_our THEN v_home ELSE v_away END,
        is_club_game = CASE WHEN v_ours THEN true
                            WHEN EXISTS (SELECT 1 FROM public.game_sessions gs WHERE gs.event_id = e.id) THEN e.is_club_game
                            ELSE false END,
        club_id      = CASE WHEN v_ours THEN v_club
                            WHEN EXISTS (SELECT 1 FROM public.game_sessions gs WHERE gs.event_id = e.id) THEN e.club_id
                            ELSE NULL END
      WHERE e.id = r.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.taca_after_result_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event  uuid;
  v_season uuid;
  v_comp   text;
BEGIN
  v_event := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
  SELECT season_id, competition INTO v_season, v_comp FROM public.events WHERE id = v_event;
  IF v_comp = 'Taça' THEN
    PERFORM public.taca_recompute_bracket(v_season);
  END IF;
  RETURN NULL;
END;
$$;

-- Na Taça não há empates (prolongamento até haver vencedor)
CREATE OR REPLACE FUNCTION public.taca_forbid_draw()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_comp text;
BEGIN
  IF NEW.home_score = NEW.away_score THEN
    SELECT competition INTO v_comp FROM public.events WHERE id = NEW.event_id;
    IF v_comp = 'Taça' THEN
      RAISE EXCEPTION 'Na Taça da Liga INATEL não há empates: o jogo tem de ter um vencedor (prolongamento)'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_taca_forbid_draw ON public.league_game_results;
CREATE TRIGGER trg_taca_forbid_draw
  BEFORE INSERT OR UPDATE ON public.league_game_results
  FOR EACH ROW EXECUTE FUNCTION public.taca_forbid_draw();

DROP TRIGGER IF EXISTS trg_taca_advance ON public.league_game_results;
CREATE TRIGGER trg_taca_advance
  AFTER INSERT OR UPDATE OR DELETE ON public.league_game_results
  FOR EACH ROW EXECUTE FUNCTION public.taca_after_result_change();

REVOKE ALL ON FUNCTION public.taca_recompute_bracket(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.taca_after_result_change() FROM PUBLIC, anon, authenticated;
