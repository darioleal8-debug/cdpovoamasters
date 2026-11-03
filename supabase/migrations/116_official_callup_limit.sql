-- Migration 116: limite de convocados em jogos oficiais
--
-- Jogos oficiais (events.game_type = 'official', i.e. Liga INATEL) podem ter
-- NO MÁXIMO 12 convocados. Não há mínimo — uma convocatória pode ter menos.
-- Jogos de treino/amigáveis não têm limite.
--
-- A app já valida isto na UI e na API (web/lib/games/callup-limits.ts);
-- este trigger é a garantia final na base de dados (inclui inserções
-- simultâneas, que a validação na API não apanha).

CREATE OR REPLACE FUNCTION public.enforce_official_callup_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_type text;
  v_count     int;
BEGIN
  -- Lock na linha do jogo para serializar convocatórias concorrentes.
  SELECT game_type INTO v_game_type
  FROM events
  WHERE id = NEW.game_id
  FOR UPDATE;

  IF v_game_type = 'official' THEN
    SELECT count(*) INTO v_count
    FROM game_callups
    WHERE game_id = NEW.game_id;

    IF v_count >= 12 THEN
      RAISE EXCEPTION 'MAX_CALLUPS: máximo de 12 convocados em jogos oficiais'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_official_callup_limit ON public.game_callups;
CREATE TRIGGER trg_enforce_official_callup_limit
  BEFORE INSERT ON public.game_callups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_official_callup_limit();
