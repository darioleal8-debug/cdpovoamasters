-- 066_training_checkin_gps.sql
-- Adiciona colunas de check-in GPS e metadados ao registo de presença no treino.
-- O check-in GPS é feito pelo próprio jogador via browser (Geolocation API),
-- dentro da janela: start_time ≤ now ≤ end_time + 30 min.

ALTER TABLE public.training_attendance
  ADD COLUMN IF NOT EXISTS method              TEXT,
  ADD COLUMN IF NOT EXISTS auto_timestamp      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_lat         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS checkin_lng         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS checkin_accuracy_m  REAL;

COMMENT ON COLUMN public.training_attendance.method              IS 'Como foi registada a presença: manual, gps_checkin, auto, etc.';
COMMENT ON COLUMN public.training_attendance.auto_timestamp      IS 'Timestamp do momento do check-in automático/GPS';
COMMENT ON COLUMN public.training_attendance.checkin_lat         IS 'Latitude GPS no momento do check-in (WGS-84)';
COMMENT ON COLUMN public.training_attendance.checkin_lng         IS 'Longitude GPS no momento do check-in (WGS-84)';
COMMENT ON COLUMN public.training_attendance.checkin_accuracy_m  IS 'Precisão estimada do GPS em metros';
