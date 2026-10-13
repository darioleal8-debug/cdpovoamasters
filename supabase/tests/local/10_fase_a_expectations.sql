-- Expectativas da Fase A (migração 056). Correr como superuser depois do baseline (+/- a 056).
-- Helpers corridos como INVOKER → a RLS do papel corrente aplica-se.
CREATE FUNCTION public._run(sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN 'erro: ' || SQLERRM; END $$;
CREATE FUNCTION public._count(sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN EXECUTE 'SELECT count(*) FROM (' || sql || ') x' INTO n; RETURN n; END $$;
CREATE FUNCTION public._affected(sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; EXCEPTION WHEN others THEN RETURN -1; END $$;
GRANT EXECUTE ON FUNCTION public._run(text), public._count(text), public._affected(text) TO authenticated, anon;

-- Fixtures
INSERT INTO auth.users VALUES ('a0000000-0000-0000-0000-000000000001'),('a0000000-0000-0000-0000-000000000002'),
 ('a0000000-0000-0000-0000-000000000003'),('a0000000-0000-0000-0000-000000000004'),('a0000000-0000-0000-0000-000000000005'),
 ('a0000000-0000-0000-0000-000000000006'),('a0000000-0000-0000-0000-000000000007');
INSERT INTO public.users(id,email,role,active) VALUES
 ('a0000000-0000-0000-0000-000000000001','admin@x','admin',true),
 ('a0000000-0000-0000-0000-000000000002','treinador@x','treinador',true),
 ('a0000000-0000-0000-0000-000000000003','seccionista@x','seccionista',true),
 ('a0000000-0000-0000-0000-000000000004','tesoureiro@x','tesoureiro',true),
 ('a0000000-0000-0000-0000-000000000005','j1@x','jogador',true),
 ('a0000000-0000-0000-0000-000000000006','j2@x','jogador',true),
 ('a0000000-0000-0000-0000-000000000007','treinador.inativo@x','treinador',false);
INSERT INTO public.seasons(id,name) VALUES ('b0000000-0000-0000-0000-000000000001','2026/27');
INSERT INTO public.players(id,season_id,user_id) VALUES
 ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005'),
 ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000006');
INSERT INTO public.events(id,season_id,title) VALUES ('e0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Jogo 1');
INSERT INTO public.player_payments(season_id,player_id) VALUES ('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
INSERT INTO public.trainings(id,season_id) VALUES ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
INSERT INTO public.training_attendance(training_id,player_id,status) VALUES ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','absent');
INSERT INTO public.chats(id,type) VALUES ('f0000000-0000-0000-0000-000000000001','direct'),('f0000000-0000-0000-0000-000000000002','direct');
INSERT INTO public.chat_participants(chat_id,user_id) VALUES
 ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005'),
 ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000006');
INSERT INTO public.chat_messages(chat_id,sender_id,content) VALUES
 ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005','minha'),
 ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000006','privada do j2');

-- ── Jogador J1 ──────────────────────────────────────────────
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000005',false);
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-01 jogador só lê mensagens dos seus chats', n=1, 'lê '||n||' de 2' FROM (SELECT public._count('SELECT 1 FROM public.chat_messages') n) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-01 jogador não escreve em chat alheio', r LIKE 'erro%', r FROM (SELECT public._run($q$INSERT INTO public.chat_messages(chat_id,sender_id,content) VALUES ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000005','intrusa')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-01 jogador vê o seu chat', n=1, 'vê '||n FROM (SELECT public._count('SELECT 1 FROM public.chats') n) x;
INSERT INTO public._results(test,ok,detail) SELECT 'PRES-01 jogador não altera a própria presença', n<=0, 'linhas alteradas: '||n FROM (SELECT public._affected($q$UPDATE public.training_attendance SET status='present'$q$) n) x;
INSERT INTO public._results(test,ok,detail) SELECT 'PRES-01 jogador não cria a própria presença', r LIKE 'erro%', r FROM (SELECT public._run($q$INSERT INTO public.training_attendance(training_id,player_id,status) VALUES ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','present')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-24 jogador não muda o próprio email', r LIKE 'erro%', r FROM (SELECT public._run($q$UPDATE public.users SET email='outro@x' WHERE id='a0000000-0000-0000-0000-000000000005'$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'controlo: jogador não lê pagamentos alheios', n=0, 'lê '||n FROM (SELECT public._count('SELECT 1 FROM public.player_payments') n) x;
RESET ROLE;

-- ── Treinador ───────────────────────────────────────────────
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false);
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 treinador cria jogo', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.events(season_id,title) VALUES ('b0000000-0000-0000-0000-000000000001','Jogo T')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 treinador convoca', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.game_callups(game_id,player_id) VALUES ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 treinador edita plantel', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.players(season_id,user_id) VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'matriz: treinador não cria temporadas (admin)', r LIKE 'erro%', r FROM (SELECT public._run($q$INSERT INTO public.seasons(name) VALUES ('x')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'matriz: treinador não lê pagamentos', n=0, 'lê '||n FROM (SELECT public._count('SELECT 1 FROM public.player_payments') n) x;
RESET ROLE;

-- ── Treinador desativado ────────────────────────────────────
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000007',false);
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-14 treinador desativado não cria jogo', r LIKE 'erro%', r FROM (SELECT public._run($q$INSERT INTO public.events(season_id,title) VALUES ('b0000000-0000-0000-0000-000000000001','Jogo inativo')$q$) r) x;
RESET ROLE;

-- ── Tesoureiro ──────────────────────────────────────────────
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000004',false);
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 tesoureiro regista quota', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.player_payments(season_id,player_id) VALUES ('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 tesoureiro regista entrada financeira', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.financial_entries(amount) VALUES (10)$q$) r) x;
RESET ROLE;

-- ── Seccionista ─────────────────────────────────────────────
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false);
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 seccionista não lê pagamentos', n=0, 'lê '||n FROM (SELECT public._count('SELECT 1 FROM public.player_payments') n) x;
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-02 seccionista não regista quotas', r LIKE 'erro%', r FROM (SELECT public._run($q$INSERT INTO public.player_payments(season_id,player_id) VALUES ('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001')$q$) r) x;
INSERT INTO public._results(test,ok,detail) SELECT 'matriz: seccionista cria jogo', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.events(season_id,title) VALUES ('b0000000-0000-0000-0000-000000000001','Jogo S')$q$) r) x;
RESET ROLE;

-- ── Admin ───────────────────────────────────────────────────
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false);
INSERT INTO public._results(test,ok,detail) SELECT 'matriz: admin cria temporada', r='ok', r FROM (SELECT public._run($q$INSERT INTO public.seasons(name) VALUES ('2027/28')$q$) r) x;
RESET ROLE;

-- ── Anónimo ─────────────────────────────────────────────────
SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);
INSERT INTO public._results(test,ok,detail) SELECT 'SEC-20 anónimo não insere access_requests direto', r LIKE 'erro%', r FROM (SELECT public._run($q$INSERT INTO public.access_requests(club_name) VALUES ('spam')$q$) r) x;
RESET ROLE;

-- ── Enum ────────────────────────────────────────────────────
INSERT INTO public._results(test,ok,detail) SELECT 'STA-07 enum tem foul_def/of/tec/anti', n=4, n||' de 4'
FROM (SELECT count(*) n FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='play_event_type' AND e.enumlabel IN ('foul_def','foul_of','foul_tec','foul_anti')) x;
