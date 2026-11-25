-- Rollback da 143: remove a agregação de utilização por clube (a global, 138, mantém-se).
DROP FUNCTION IF EXISTS public.analytics_usage_summary_club(int, uuid);
