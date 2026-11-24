-- Rollback da 140_comunicados.sql (apaga os comunicados, leituras e subscrições push).
-- O chat antigo nunca foi alterado, por isso não é preciso repor nada nele.
DROP TABLE IF EXISTS public.announcement_reads;
DROP TABLE IF EXISTS public.announcements;
DROP TABLE IF EXISTS public.push_subscriptions;
NOTIFY pgrst, 'reload schema';
