-- 115_opencv_cv_data.sql
-- Guarda o resultado do pré-processamento OpenCV em cada importação de boletim.
-- cv_data: { perspective_applied, quality: {sharpness, brightness, is_blurry, issues, legibility}, zones: {...} }
-- Idempotente.

ALTER TABLE public.game_sheet_imports
  ADD COLUMN IF NOT EXISTS cv_data jsonb;

COMMENT ON COLUMN public.game_sheet_imports.cv_data IS
  'Resultado do microserviço OpenCV: perspective_applied, quality, zones (coordenadas normalizadas 0-1)';
