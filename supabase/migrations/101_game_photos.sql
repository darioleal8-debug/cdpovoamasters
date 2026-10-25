-- 101_game_photos.sql
-- Fotografias de jogo enviadas pelas equipas durante a submissão do resultado.
-- A primeira foto visível torna-se a capa da notícia automática (substitui fal.ai).
-- As restantes aparecem numa galeria na página da notícia.

-- ─── Tabela ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_photos (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id      uuid        NOT NULL REFERENCES public.events(id)        ON DELETE CASCADE,
  team_id      uuid        NOT NULL REFERENCES public.league_teams(id)  ON DELETE CASCADE,
  storage_path text        NOT NULL,
  caption      text        CHECK (char_length(caption) <= 120),
  sort_order   smallint    NOT NULL DEFAULT 0,
  uploaded_by  uuid        REFERENCES auth.users(id)                    ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  hidden       boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS game_photos_game_idx  ON public.game_photos (game_id);
CREATE INDEX IF NOT EXISTS game_photos_team_idx  ON public.game_photos (game_id, team_id);

-- Limite: 3 fotos por equipa por jogo (garante-se também no servidor via trigger)
CREATE OR REPLACE FUNCTION public.enforce_max_3_game_photos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c
    FROM public.game_photos
   WHERE game_id = NEW.game_id AND team_id = NEW.team_id;
  IF c >= 3 THEN
    RAISE EXCEPTION 'max_photos_exceeded: limite de 3 fotografias por equipa por jogo';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_photos_max_3 ON public.game_photos;
CREATE TRIGGER game_photos_max_3
  BEFORE INSERT ON public.game_photos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_3_game_photos();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.game_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gp_public_read"   ON public.game_photos;
CREATE POLICY "gp_public_read"   ON public.game_photos
  FOR SELECT USING (hidden = false);

DROP POLICY IF EXISTS "gp_admin_read"    ON public.game_photos;
CREATE POLICY "gp_admin_read"    ON public.game_photos
  FOR SELECT TO authenticated
  USING (public.is_liga_admin() OR public.is_admin());

-- Equipa insere: membro da equipa, resultado ainda não aprovado
DROP POLICY IF EXISTS "gp_team_insert"   ON public.game_photos;
CREATE POLICY "gp_team_insert"   ON public.game_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.league_team_members ltm
      WHERE ltm.user_id = auth.uid() AND ltm.team_id = game_photos.team_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.league_game_results lgr
      WHERE lgr.event_id = game_photos.game_id
    )
  );

-- Apagar: o próprio uploader ou admin
DROP POLICY IF EXISTS "gp_delete"        ON public.game_photos;
CREATE POLICY "gp_delete"        ON public.game_photos
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_liga_admin() OR public.is_admin());

-- Admin atualiza hidden / sort_order
DROP POLICY IF EXISTS "gp_admin_update"  ON public.game_photos;
CREATE POLICY "gp_admin_update"  ON public.game_photos
  FOR UPDATE TO authenticated
  USING (public.is_liga_admin() OR public.is_admin())
  WITH CHECK (public.is_liga_admin() OR public.is_admin());

GRANT SELECT             ON public.game_photos TO anon, authenticated;
GRANT INSERT, DELETE     ON public.game_photos TO authenticated;
GRANT ALL                ON public.game_photos TO service_role;

-- ─── Bucket "game-photos" ─────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'game-photos', 'game-photos', true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- A API usa service_role para uploads/deletes; as políticas abaixo são defensivas.
DROP POLICY IF EXISTS "gp_storage_insert" ON storage.objects;
CREATE POLICY "gp_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'game-photos'
    AND EXISTS (SELECT 1 FROM public.league_team_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "gp_storage_delete" ON storage.objects;
CREATE POLICY "gp_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'game-photos'
    AND (public.is_liga_admin() OR public.is_admin())
  );

-- ─── news: coluna para capa vinda de foto real ────────────────────────────────

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS cover_photo_id uuid
    REFERENCES public.game_photos(id) ON DELETE SET NULL;
