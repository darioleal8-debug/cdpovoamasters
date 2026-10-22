-- 087_result_submissions_extraction_raw.sql
-- Bug fix: guardar extraction_raw (dados do DeepSeek) na submissão
--
-- Causa: coluna não existia — submit route recebia extraction_raw no body
-- mas descartava-a silenciosamente. generate-news lia extraction_raw = null.

ALTER TABLE public.result_submissions
  ADD COLUMN IF NOT EXISTS extraction_raw JSONB;
