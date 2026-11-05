-- 119_game_photos_anytime.sql
-- Fotografias de jogo podem ser adicionadas a qualquer momento, incluindo depois
-- de o resultado estar confirmado:
--   • delegados de uma das equipas do jogo (via API, service_role);
--   • admin da liga/clube, com ou sem equipa associada (team_id NULL = "Liga INATEL").
-- O limite por equipa sobe de 3 para 10 (a submissão do resultado continua a
-- sugerir até 3; o resto pode ser acrescentado depois). Fotos do admin sem
-- equipa não contam para nenhum limite.

ALTER TABLE public.game_photos ALTER COLUMN team_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_max_3_game_photos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c int;
BEGIN
  IF NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO c
    FROM public.game_photos
   WHERE game_id = NEW.game_id AND team_id = NEW.team_id;
  IF c >= 10 THEN
    RAISE EXCEPTION 'max_photos_exceeded: limite de 10 fotografias por equipa por jogo';
  END IF;
  RETURN NEW;
END;
$$;

-- Inserção directa (defensiva — a API usa service_role): membro da equipa,
-- sem restrição de o resultado já estar aprovado; admin sempre.
DROP POLICY IF EXISTS "gp_team_insert" ON public.game_photos;
CREATE POLICY "gp_team_insert" ON public.game_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_liga_admin() OR public.is_admin()
    OR (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.league_team_members ltm
        WHERE ltm.user_id = auth.uid() AND ltm.team_id = game_photos.team_id
      )
    )
  );
