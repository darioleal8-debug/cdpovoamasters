-- Fase 3e: club_id nas tabelas filhas (herdado do pai por trigger) + RLS restritiva. JÁ APLICADA em produção.
DO $mig$
DECLARE
  r record;
  nulls bigint;
BEGIN
  CREATE OR REPLACE FUNCTION public.set_club_id_from_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
  $f$
  DECLARE v_id uuid;
  BEGIN
    IF NEW.club_id IS NULL THEN
      v_id := NULLIF(to_jsonb(NEW)->>TG_ARGV[0], '')::uuid;
      IF v_id IS NOT NULL THEN
        EXECUTE format('SELECT club_id FROM public.%I WHERE id = $1', TG_ARGV[1]) INTO NEW.club_id USING v_id;
      END IF;
    END IF;
    RETURN NEW;
  END $f$;
  REVOKE ALL ON FUNCTION public.set_club_id_from_parent() FROM PUBLIC, anon, authenticated;

  FOR r IN SELECT * FROM (VALUES
    ('calendar_imports','season_id','seasons',true),
    ('chat_messages','chat_id','chats',false),
    ('chat_participants','chat_id','chats',false),
    ('game_current_lineup','game_session_id','game_sessions',true),
    ('game_period_scores','game_session_id','game_sessions',true),
    ('game_substitutions','game_session_id','game_sessions',true),
    ('play_by_play','game_session_id','game_sessions',true),
    ('player_court_stints','game_session_id','game_sessions',true),
    ('player_game_stats','game_session_id','game_sessions',true),
    ('payments','season_id','seasons',true),
    ('play_progress','play_id','plays',true),
    ('player_documents','player_id','players',true),
    ('player_profiles','season_id','seasons',true),
    ('player_stats','player_id','players',true)
  ) AS v(tbl, col, parent, rls) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id)', r.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(club_id)', r.tbl||'_club_id_idx', r.tbl);
    EXECUTE format('UPDATE public.%I c SET club_id = p.club_id FROM public.%I p WHERE p.id = c.%I AND c.club_id IS NULL', r.tbl, r.parent, r.col);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE club_id IS NULL', r.tbl) INTO nulls;
    IF nulls > 0 THEN RAISE EXCEPTION 'tabela % com % linhas sem clube', r.tbl, nulls; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS set_club_id ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER set_club_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_club_id_from_parent(%L, %L)', r.tbl, r.col, r.parent);
    IF r.rls THEN
      EXECUTE format('DROP POLICY IF EXISTS club_isolation ON public.%I', r.tbl);
      EXECUTE format('CREATE POLICY club_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (club_id = ANY (public.my_club_ids())) WITH CHECK (club_id = ANY (public.my_club_ids()))', r.tbl);
    END IF;
  END LOOP;
END
$mig$;
