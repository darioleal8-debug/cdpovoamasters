-- Liga INATEL: períodos de 8 minutos. Novo valor por defeito para
-- game_sessions.period_duration_secs (era 600 = 10 min). A app define-o
-- explicitamente no início do jogo (ajustável); isto cobre outros inserts.
ALTER TABLE public.game_sessions ALTER COLUMN period_duration_secs SET DEFAULT 480;
