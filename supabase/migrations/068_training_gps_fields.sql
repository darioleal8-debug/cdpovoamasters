-- 068_training_gps_fields.sql
-- Completa as colunas GPS em training_attendance e adiciona coordenadas de
-- recinto a trainings, para validação de proximidade no check-in.

-- Renomear checkin_lat/lng para gps_lat/lng (alinha com o tipo TrainingAttendance)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_attendance'
      AND column_name = 'checkin_lat'
  ) THEN
    ALTER TABLE public.training_attendance RENAME COLUMN checkin_lat TO gps_lat;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_attendance'
      AND column_name = 'checkin_lng'
  ) THEN
    ALTER TABLE public.training_attendance RENAME COLUMN checkin_lng TO gps_lng;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_attendance'
      AND column_name = 'checkin_accuracy_m'
  ) THEN
    ALTER TABLE public.training_attendance RENAME COLUMN checkin_accuracy_m TO gps_accuracy_m;
  END IF;
END $$;

-- Adicionar colunas de validação GPS
ALTER TABLE public.training_attendance
  ADD COLUMN IF NOT EXISTS gps_validated   BOOLEAN,
  ADD COLUMN IF NOT EXISTS gps_distance_m  REAL;

-- Adicionar coordenadas de recinto aos treinos
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS location_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng  DOUBLE PRECISION;

COMMENT ON COLUMN public.training_attendance.gps_lat         IS 'Latitude GPS do jogador no check-in (WGS-84)';
COMMENT ON COLUMN public.training_attendance.gps_lng         IS 'Longitude GPS do jogador no check-in (WGS-84)';
COMMENT ON COLUMN public.training_attendance.gps_accuracy_m  IS 'Precisão estimada do GPS em metros';
COMMENT ON COLUMN public.training_attendance.gps_validated   IS 'true = dentro de 500m do recinto; false = fora; null = recinto sem coords';
COMMENT ON COLUMN public.training_attendance.gps_distance_m  IS 'Distância calculada entre jogador e recinto em metros';
COMMENT ON COLUMN public.trainings.location_lat              IS 'Latitude do recinto do treino (WGS-84)';
COMMENT ON COLUMN public.trainings.location_lng              IS 'Longitude do recinto do treino (WGS-84)';
