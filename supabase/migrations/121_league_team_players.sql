-- 121_league_team_players.sql
-- Plantel de cada equipa da Liga INATEL, gerido pelo delegado: fotografia, número, primeiro e
-- último nome. Público (página da equipa) e usado como referência na leitura das folhas de jogo
-- e estatísticas (confirmar nome ↔ número de cada jogador).
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.league_team_players (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
  first_name  varchar(60) NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name   varchar(60) NOT NULL CHECK (length(trim(last_name)) > 0),
  number      smallint    CHECK (number IS NULL OR number BETWEEN 0 AND 99),
  photo_path  text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ltp_team_idx ON public.league_team_players(team_id) WHERE is_active;
-- Um número por jogador ativo em cada equipa
CREATE UNIQUE INDEX IF NOT EXISTS ltp_team_number_unique
  ON public.league_team_players(team_id, number) WHERE is_active AND number IS NOT NULL;

ALTER TABLE public.league_team_players ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Público: só jogadores ativos (página pública da equipa)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'league_team_players' AND policyname = 'ltp_public_select') THEN
    CREATE POLICY ltp_public_select ON public.league_team_players FOR SELECT TO anon, authenticated
      USING (is_active OR team_id = public.get_my_league_team_id() OR public.is_liga_admin());
  END IF;
  -- Delegado gere só o plantel da sua equipa
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'league_team_players' AND policyname = 'ltp_delegate_insert') THEN
    CREATE POLICY ltp_delegate_insert ON public.league_team_players FOR INSERT TO authenticated
      WITH CHECK (team_id = public.get_my_league_team_id() OR public.is_liga_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'league_team_players' AND policyname = 'ltp_delegate_update') THEN
    CREATE POLICY ltp_delegate_update ON public.league_team_players FOR UPDATE TO authenticated
      USING (team_id = public.get_my_league_team_id() OR public.is_liga_admin())
      WITH CHECK (team_id = public.get_my_league_team_id() OR public.is_liga_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'league_team_players' AND policyname = 'ltp_delegate_delete') THEN
    CREATE POLICY ltp_delegate_delete ON public.league_team_players FOR DELETE TO authenticated
      USING (team_id = public.get_my_league_team_id() OR public.is_liga_admin());
  END IF;
END $$;

GRANT SELECT ON public.league_team_players TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.league_team_players TO authenticated;
GRANT ALL ON public.league_team_players TO service_role;

-- ─── Fotografias (bucket público; pasta = id da equipa) ──────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('league-player-photos', 'league-player-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lpp_storage_insert') THEN
    CREATE POLICY lpp_storage_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'league-player-photos'
        AND ((storage.foldername(name))[1] = public.get_my_league_team_id()::text OR public.is_liga_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lpp_storage_update') THEN
    CREATE POLICY lpp_storage_update ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'league-player-photos'
        AND ((storage.foldername(name))[1] = public.get_my_league_team_id()::text OR public.is_liga_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lpp_storage_delete') THEN
    CREATE POLICY lpp_storage_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'league-player-photos'
        AND ((storage.foldername(name))[1] = public.get_my_league_team_id()::text OR public.is_liga_admin()));
  END IF;
END $$;
