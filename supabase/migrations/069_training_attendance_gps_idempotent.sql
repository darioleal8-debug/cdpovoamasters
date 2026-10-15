-- 069_training_attendance_gps_idempotent.sql
-- Migração idempotente que garante todas as colunas GPS em training_attendance
-- e as coordenadas de recinto em trainings, independentemente do estado das
-- migrações 066/067/068 (aplicadas ou não). Segura correr N vezes.

-- ── training_attendance: colunas GPS ─────────────────────────────────────────

ALTER TABLE public.training_attendance
  ADD COLUMN IF NOT EXISTS method         TEXT,
  ADD COLUMN IF NOT EXISTS auto_timestamp TIMESTAMPTZ;

-- Garantir gps_lat (pode vir de checkin_lat se 066 foi aplicada sem 068)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_attendance'
      AND column_name = 'gps_lat'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'training_attendance'
        AND column_name = 'checkin_lat'
    ) THEN
      ALTER TABLE public.training_attendance RENAME COLUMN checkin_lat TO gps_lat;
    ELSE
      ALTER TABLE public.training_attendance ADD COLUMN gps_lat DOUBLE PRECISION;
    END IF;
  END IF;
END $$;

-- Garantir gps_lng
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_attendance'
      AND column_name = 'gps_lng'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'training_attendance'
        AND column_name = 'checkin_lng'
    ) THEN
      ALTER TABLE public.training_attendance RENAME COLUMN checkin_lng TO gps_lng;
    ELSE
      ALTER TABLE public.training_attendance ADD COLUMN gps_lng DOUBLE PRECISION;
    END IF;
  END IF;
END $$;

-- Garantir gps_accuracy_m
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_attendance'
      AND column_name = 'gps_accuracy_m'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'training_attendance'
        AND column_name = 'checkin_accuracy_m'
    ) THEN
      ALTER TABLE public.training_attendance RENAME COLUMN checkin_accuracy_m TO gps_accuracy_m;
    ELSE
      ALTER TABLE public.training_attendance ADD COLUMN gps_accuracy_m DOUBLE PRECISION;
    END IF;
  END IF;
END $$;

ALTER TABLE public.training_attendance
  ADD COLUMN IF NOT EXISTS gps_validated  BOOLEAN,
  ADD COLUMN IF NOT EXISTS gps_distance_m REAL,
  ADD COLUMN IF NOT EXISTS gps_status     TEXT;

-- ── trainings: coordenadas de recinto ────────────────────────────────────────

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;

-- ── RLS: política INSERT para jogadores ──────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'training_attendance'
      AND policyname = 'p1_training_attendance_own_insert'
  ) THEN
    CREATE POLICY "p1_training_attendance_own_insert" ON public.training_attendance
      FOR INSERT TO authenticated
      WITH CHECK (
        player_id IN (
          SELECT id FROM public.players WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── Recarregar schema cache do PostgREST ─────────────────────────────────────

NOTIFY pgrst, 'reload schema';
