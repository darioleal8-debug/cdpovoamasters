-- Esquema mínimo (subset de produção) para testar a migração 111 num Postgres efémero.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.competitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE);
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text, deleted_at timestamptz,
  is_test boolean NOT NULL DEFAULT false
);
CREATE TABLE public.league_teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, normalized_name text);
CREATE TABLE public.league_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, team_id uuid REFERENCES public.league_teams(id)
);
CREATE TABLE public.liga_admins (user_id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.is_liga_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.liga_admins WHERE user_id = auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.resolve_team_id(p text) RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT id FROM public.league_teams WHERE lower(name) = lower(p) LIMIT 1 $$;

CREATE TABLE public.result_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  competition_id uuid, home_team_name text NOT NULL, away_team_name text NOT NULL,
  home_score int NOT NULL, away_score int NOT NULL, submitted_by_name text NOT NULL DEFAULT 'x',
  submitted_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz, reviewed_by uuid, rejection_reason text, submitted_by_user_id uuid,
  home_team_id uuid, away_team_id uuid, extraction_raw jsonb, photo_url text
);
ALTER TABLE public.result_submissions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.league_game_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE, competition_id uuid,
  home_team_name text NOT NULL, away_team_name text NOT NULL, home_score int NOT NULL, away_score int NOT NULL,
  home_team_id uuid, away_team_id uuid, approved_at timestamptz, approved_by uuid,
  referees text[], overtime boolean DEFAULT false, source_submission_id uuid
);
CREATE TABLE public.league_game_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, periodo smallint NOT NULL,
  home_points smallint NOT NULL, away_points smallint NOT NULL, UNIQUE (event_id, periodo)
);
CREATE TABLE public.league_game_player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, team_id uuid,
  side text NOT NULL, numero smallint, nome text NOT NULL, pontos smallint NOT NULL DEFAULT 0,
  triplos smallint NOT NULL DEFAULT 0, lances_livres smallint NOT NULL DEFAULT 0, faltas smallint NOT NULL DEFAULT 0
);
CREATE TABLE public.liga_resultado_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), jogo_id uuid NOT NULL, alterado_por uuid,
  valor_antigo jsonb, valor_novo jsonb NOT NULL, motivo text NOT NULL, created_at timestamptz DEFAULT now()
);

-- Grants por defeito do Supabase (o acesso real é controlado por RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
