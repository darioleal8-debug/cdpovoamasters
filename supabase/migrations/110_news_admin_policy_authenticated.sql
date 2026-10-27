-- A política news_admin_all estava aplicada ao role "public" (inclui anon).
-- Para visitantes anónimos o Postgres avaliava is_admin(), sobre a qual anon não tem EXECUTE,
-- e TODA a consulta à tabela news falhava (401 "permission denied for function is_admin").
-- Resultado: notícias invisíveis para quem não tinha sessão iniciada (ex.: telemóvel).
alter policy news_admin_all on public.news to authenticated;
