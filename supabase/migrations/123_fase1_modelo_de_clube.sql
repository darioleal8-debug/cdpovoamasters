-- Fase 1: modelo de clube (clubs, club_members, club_id nas tabelas de dados).
-- JÁ APLICADA em produção (20261112170958). Idempotente.
DO $mig$
DECLARE
  v_club uuid;
  v_team uuid;
  t text;
  tabs text[] := ARRAY['seasons','players','trainings','training_attendance','training_rsvps','training_notes','training_recurrence_rules','events','game_callups','game_availability','game_sessions','financial_entries','financial_expenses','financial_cash_movements','player_payments','player_payments_history','payment_receipts','documents','chats','birthday_messages','plays','team_kits','club_events','access_requests','palmares'];
BEGIN
  CREATE TABLE IF NOT EXISTS public.clubs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    logo_url text,
    primary_color text NOT NULL DEFAULT '#111111',
    secondary_color text NOT NULL DEFAULT '#F28C28',
    accent_color text NOT NULL DEFAULT '#ffffff',
    is_public boolean NOT NULL DEFAULT true,
    photo_template jsonb,
    league_team_id uuid UNIQUE REFERENCES public.league_teams(id) ON DELETE SET NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS clubs_select ON public.clubs;
  CREATE POLICY clubs_select ON public.clubs FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS clubs_admin_write ON public.clubs;
  CREATE POLICY clubs_admin_write ON public.clubs FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  REVOKE ALL ON public.clubs FROM anon;

  CREATE TABLE IF NOT EXISTS public.club_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (club_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS club_members_user_idx ON public.club_members(user_id);
  ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS club_members_select_self ON public.club_members;
  CREATE POLICY club_members_select_self ON public.club_members FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
  DROP POLICY IF EXISTS club_members_admin_all ON public.club_members;
  CREATE POLICY club_members_admin_all ON public.club_members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  REVOKE ALL ON public.club_members FROM anon;

  SELECT id INTO v_team FROM public.league_teams WHERE is_our_team LIMIT 1;
  INSERT INTO public.clubs (name, slug, logo_url, primary_color, secondary_color, accent_color, is_public, photo_template, league_team_id)
  SELECT cs.club_name, cs.slug, cs.logo_url, cs.primary_color, cs.secondary_color, cs.accent_color, cs.is_public, cs.photo_template, v_team
  FROM public.club_settings cs WHERE cs.id = 'default'
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_club FROM public.clubs WHERE slug = 'cd-povoa-masters';
  IF v_club IS NULL THEN RAISE EXCEPTION 'clube CD Povoa nao criado'; END IF;

  INSERT INTO public.club_members (club_id, user_id, role, active)
  SELECT v_club, u.id, u.role::text, coalesce(u.active, true)
  FROM public.users u WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ON CONFLICT (club_id, user_id) DO NOTHING;

  FOREACH t IN ARRAY tabs LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(club_id)', t||'_club_id_idx', t);
    IF t = 'events' THEN
      EXECUTE format('UPDATE public.events SET club_id = %L WHERE is_club_game = true AND club_id IS NULL', v_club);
    ELSE
      EXECUTE format('UPDATE public.%I SET club_id = %L WHERE club_id IS NULL', t, v_club);
    END IF;
  END LOOP;
END
$mig$;
