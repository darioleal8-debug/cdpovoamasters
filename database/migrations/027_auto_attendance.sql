-- 027_auto_attendance.sql
-- Auto-Presença: GPS + foto na tabela trainings e training_attendance

-- 1. GPS do local do treino (para validação automática)
ALTER TABLE trainings
  ADD COLUMN IF NOT EXISTS location_lat  double precision,
  ADD COLUMN IF NOT EXISTS location_lng  double precision;

-- 2. Campos de auto-presença em training_attendance
ALTER TABLE training_attendance
  ADD COLUMN IF NOT EXISTS photo_url      text,
  ADD COLUMN IF NOT EXISTS gps_lat        double precision,
  ADD COLUMN IF NOT EXISTS gps_lng        double precision,
  ADD COLUMN IF NOT EXISTS gps_validated  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_distance_m integer,
  ADD COLUMN IF NOT EXISTS auto_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS photo_hash     text;

-- 3. Atualizar constraint de status para permitir 'auto_present'
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'training_attendance'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE training_attendance DROP CONSTRAINT ' || quote_ident(v_conname);
  END IF;

  ALTER TABLE training_attendance
    ADD CONSTRAINT training_attendance_status_check
    CHECK (status IN ('present', 'absent', 'justified', 'late', 'auto_present'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint update skipped: %', SQLERRM;
END $$;

-- 4. Índices úteis
CREATE INDEX IF NOT EXISTS idx_training_attendance_photo_hash
  ON training_attendance(training_id, photo_hash)
  WHERE photo_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_attendance_auto
  ON training_attendance(training_id)
  WHERE status = 'auto_present';
