-- Migration 077: Calendário oficial Liga INATEL Porto 2026/27 – Primeira Fase
-- Substitui os 8 eventos placeholder (sem resultados nem submissões) pelos
-- 60 jogos oficiais do calendário provisório (3ª versão) publicado pela INATEL.
--
-- Equipa: AC506A03-AE37-4E3F-94FD-1C03443E339E = temporada "Masters 2026/2027"
-- competition_key = 'Liga'
--
-- ANTES de aplicar confirma: SELECT COUNT(*) FROM league_game_results lgr
--   JOIN events e ON e.id = lgr.event_id
--   WHERE e.competition = 'Liga' AND e.season_id = 'ac506a03-ae37-4e3f-94fd-1c03443e339e'
--   AND e.game_type = 'official';   → deve ser 0

-- ─── 1. Remove eventos Liga oficiais existentes (placeholder) ─────────────────
DELETE FROM events
WHERE competition   = 'Liga'
  AND season_id     = 'ac506a03-ae37-4e3f-94fd-1c03443e339e'
  AND type          = 'jogo'
  AND game_type     = 'official';

-- ─── 2. Insere todos os 60 jogos ─────────────────────────────────────────────
INSERT INTO events
  (season_id, type, title, location, event_date, event_time,
   opponent, description, competition, game_type)
VALUES

-- ══════════════════════════════════════════
-- 1ª JORNADA  (26-31 outubro 2026)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J1A · Coral Fides OV vs CD Póvoa',
 'Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar — Gondomar','2026-10-29','22:15',
 'CD Póvoa',
 '{"jornada":1,"volta":1,"jogo_num":1,"home_team":"Coral Fides OV","away_team":"CD Póvoa","pavilion":"Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar","locality":"Gondomar","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J1A · A Portuguesa de Leça FC vs BC Barcelos',
 'Pav. Escola EB 2,3 Perafita — Perafita-Matosinhos','2026-10-29','20:15',
 'BC Barcelos',
 '{"jornada":1,"volta":1,"jogo_num":2,"home_team":"A Portuguesa de Leça FC","away_team":"BC Barcelos","pavilion":"Pav. Escola EB 2,3 Perafita","locality":"Perafita-Matosinhos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J1B · Powertogether Associação vs Matosinhos Basket CA',
 'Pav. Mun. Prof. Miranda de Carvalho — VN Gaia','2026-10-26','21:30',
 'Matosinhos Basket CA',
 '{"jornada":1,"volta":1,"jogo_num":3,"home_team":"Powertogether Associação","away_team":"Matosinhos Basket CA","pavilion":"Pav. Mun. Prof. Miranda de Carvalho","locality":"VN Gaia","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J1B · NCR Valongo vs Famalicense AC',
 'Pav. Escola Básica Vallis Longus — Valongo','2026-10-27','21:30',
 'Famalicense AC',
 '{"jornada":1,"volta":1,"jogo_num":4,"home_team":"NCR Valongo","away_team":"Famalicense AC","pavilion":"Pav. Escola Básica Vallis Longus","locality":"Valongo","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J1C · CBF Felgueiras BAD vs GD André Soares',
 'Pav. Escola Sec. Felgueiras — Felgueiras','2026-10-31','15:30',
 'GD André Soares',
 '{"jornada":1,"volta":1,"jogo_num":5,"home_team":"CBF Felgueiras BAD","away_team":"GD André Soares","pavilion":"Pav. Escola Sec. Felgueiras","locality":"Felgueiras","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J1C · Enesse BC vs UAA Aroso',
 'Pav. Municipal Prof. António Costeira — Oliv. Azeméis','2026-10-31','17:00',
 'UAA Aroso',
 '{"jornada":1,"volta":1,"jogo_num":6,"home_team":"Enesse BC","away_team":"UAA Aroso","pavilion":"Pav. Municipal Prof. António Costeira","locality":"Oliv. Azeméis","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 2ª JORNADA  (03-06 novembro 2026)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J2A · CD Póvoa vs A Portuguesa de Leça FC',
 'Pav. Desportivo Eça de Queirós — Póvoa Varzim','2026-11-04','22:15',
 'A Portuguesa de Leça FC',
 '{"jornada":2,"volta":1,"jogo_num":7,"home_team":"CD Póvoa","away_team":"A Portuguesa de Leça FC","pavilion":"Pav. Desportivo Eça de Queirós","locality":"Póvoa Varzim","serie":"A","is_home":true}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J2A · BC Barcelos vs Barca BC',
 'Pav. Desportivo Adães — Adães-Barcelos','2026-11-06','22:30',
 'Barca BC',
 '{"jornada":2,"volta":1,"jogo_num":8,"home_team":"BC Barcelos","away_team":"Barca BC","pavilion":"Pav. Desportivo Adães","locality":"Adães-Barcelos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J2B · Matosinhos Basket CA vs Famalicense AC',
 'Pav. Municipal Padrão da Légua — Padrão Légua-Matosinhos','2026-11-05','22:45',
 'Famalicense AC',
 '{"jornada":2,"volta":1,"jogo_num":9,"home_team":"Matosinhos Basket CA","away_team":"Famalicense AC","pavilion":"Pav. Municipal Padrão da Légua","locality":"Padrão Légua-Matosinhos","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J2B · NCR Valongo vs União Afuradense BelticBasket',
 'Pav. Escola Básica Vallis Longus — Valongo','2026-11-03','21:30',
 'União Afuradense BelticBasket',
 '{"jornada":2,"volta":1,"jogo_num":10,"home_team":"NCR Valongo","away_team":"União Afuradense BelticBasket","pavilion":"Pav. Escola Básica Vallis Longus","locality":"Valongo","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J2C · GD André Soares vs Enesse BC',
 'Pav. Maximinos — Braga','2026-11-04','22:15',
 'Enesse BC',
 '{"jornada":2,"volta":1,"jogo_num":11,"home_team":"GD André Soares","away_team":"Enesse BC","pavilion":"Pav. Maximinos","locality":"Braga","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J2C · UAA Aroso vs USC Paredes',
 'Pav. Escola Básica Manoel Oliveira — Porto','2026-11-05','21:45',
 'USC Paredes',
 '{"jornada":2,"volta":1,"jogo_num":12,"home_team":"UAA Aroso","away_team":"USC Paredes","pavilion":"Pav. Escola Básica Manoel Oliveira","locality":"Porto","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 3ª JORNADA  (09-14 novembro 2026)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J3A · Barca BC vs CD Póvoa',
 'Pav. Municipal Ponte da Barca — Ponte da Barca','2026-11-14','17:00',
 'CD Póvoa',
 '{"jornada":3,"volta":1,"jogo_num":13,"home_team":"Barca BC","away_team":"CD Póvoa","pavilion":"Pav. Municipal Ponte da Barca","locality":"Ponte da Barca","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J3A · A Portuguesa de Leça FC vs Coral Fides OV',
 'Pav. Escola EB 2,3 Perafita — Perafita-Matosinhos','2026-11-12','20:15',
 'Coral Fides OV',
 '{"jornada":3,"volta":1,"jogo_num":14,"home_team":"A Portuguesa de Leça FC","away_team":"Coral Fides OV","pavilion":"Pav. Escola EB 2,3 Perafita","locality":"Perafita-Matosinhos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J3B · União Afuradense BelticBasket vs Matosinhos Basket CA',
 'Pav. Escola Sec. Rodrigues Freitas — Porto','2026-11-14','22:00',
 'Matosinhos Basket CA',
 '{"jornada":3,"volta":1,"jogo_num":15,"home_team":"União Afuradense BelticBasket","away_team":"Matosinhos Basket CA","pavilion":"Pav. Escola Sec. Rodrigues Freitas","locality":"Porto","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J3B · Famalicense AC vs Powertogether Associação',
 'Complexo Desportivo do Vale de São Cosme — S.Cosme-Famalicão','2026-11-10','21:00',
 'Powertogether Associação',
 '{"jornada":3,"volta":1,"jogo_num":16,"home_team":"Famalicense AC","away_team":"Powertogether Associação","pavilion":"Complexo Desportivo do Vale de São Cosme","locality":"S.Cosme-Famalicão","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J3C · USC Paredes vs GD André Soares',
 'Pav. Rota dos Móveis — Lordelo-Paredes','2026-11-09','21:30',
 'GD André Soares',
 '{"jornada":3,"volta":1,"jogo_num":17,"home_team":"USC Paredes","away_team":"GD André Soares","pavilion":"Pav. Rota dos Móveis","locality":"Lordelo-Paredes","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J3C · Enesse BC vs CBF Felgueiras BAD',
 'Pav. Municipal Prof. António Costeira — Oliv. Azeméis','2026-11-14','17:00',
 'CBF Felgueiras BAD',
 '{"jornada":3,"volta":1,"jogo_num":18,"home_team":"Enesse BC","away_team":"CBF Felgueiras BAD","pavilion":"Pav. Municipal Prof. António Costeira","locality":"Oliv. Azeméis","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 4ª JORNADA  (16-21 novembro 2026)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J4A · CD Póvoa vs BC Barcelos',
 'Pav. Desportivo Eça de Queirós — Póvoa Varzim','2026-11-18','22:15',
 'BC Barcelos',
 '{"jornada":4,"volta":1,"jogo_num":19,"home_team":"CD Póvoa","away_team":"BC Barcelos","pavilion":"Pav. Desportivo Eça de Queirós","locality":"Póvoa Varzim","serie":"A","is_home":true}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J4A · Coral Fides OV vs Barca BC',
 'Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar — Gondomar','2026-11-19','22:15',
 'Barca BC',
 '{"jornada":4,"volta":1,"jogo_num":20,"home_team":"Coral Fides OV","away_team":"Barca BC","pavilion":"Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar","locality":"Gondomar","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J4B · Matosinhos Basket CA vs NCR Valongo',
 'Pav. Municipal Padrão da Légua — Padrão Légua-Matosinhos','2026-11-19','22:45',
 'NCR Valongo',
 '{"jornada":4,"volta":1,"jogo_num":21,"home_team":"Matosinhos Basket CA","away_team":"NCR Valongo","pavilion":"Pav. Municipal Padrão da Légua","locality":"Padrão Légua-Matosinhos","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J4B · Powertogether Associação vs União Afuradense BelticBasket',
 'Pav. Mun. Prof. Miranda de Carvalho — VN Gaia','2026-11-16','21:30',
 'União Afuradense BelticBasket',
 '{"jornada":4,"volta":1,"jogo_num":22,"home_team":"Powertogether Associação","away_team":"União Afuradense BelticBasket","pavilion":"Pav. Mun. Prof. Miranda de Carvalho","locality":"VN Gaia","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J4C · GD André Soares vs UAA Aroso',
 'Pav. Maximinos — Braga','2026-11-18','22:15',
 'UAA Aroso',
 '{"jornada":4,"volta":1,"jogo_num":23,"home_team":"GD André Soares","away_team":"UAA Aroso","pavilion":"Pav. Maximinos","locality":"Braga","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J4C · CBF Felgueiras BAD vs USC Paredes',
 'Pav. Escola Sec. Felgueiras — Felgueiras','2026-11-21','15:30',
 'USC Paredes',
 '{"jornada":4,"volta":1,"jogo_num":24,"home_team":"CBF Felgueiras BAD","away_team":"USC Paredes","pavilion":"Pav. Escola Sec. Felgueiras","locality":"Felgueiras","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 5ª JORNADA  (30 nov – 05 dez 2026)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J5A · BC Barcelos vs Coral Fides OV',
 'Pav. Desportivo Adães — Adães-Barcelos','2026-12-04','22:30',
 'Coral Fides OV',
 '{"jornada":5,"volta":1,"jogo_num":25,"home_team":"BC Barcelos","away_team":"Coral Fides OV","pavilion":"Pav. Desportivo Adães","locality":"Adães-Barcelos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J5A · Barca BC vs A Portuguesa de Leça FC',
 'Pav. Municipal Ponte da Barca — Ponte da Barca','2026-12-05','17:00',
 'A Portuguesa de Leça FC',
 '{"jornada":5,"volta":1,"jogo_num":26,"home_team":"Barca BC","away_team":"A Portuguesa de Leça FC","pavilion":"Pav. Municipal Ponte da Barca","locality":"Ponte da Barca","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J5B · NCR Valongo vs Powertogether Associação',
 'Pav. Escola Básica Vallis Longus — Valongo','2026-12-01','21:30',
 'Powertogether Associação',
 '{"jornada":5,"volta":1,"jogo_num":27,"home_team":"NCR Valongo","away_team":"Powertogether Associação","pavilion":"Pav. Escola Básica Vallis Longus","locality":"Valongo","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J5B · União Afuradense BelticBasket vs Famalicense AC',
 'Pav. Escola Sec. Rodrigues Freitas — Porto','2026-12-05','22:00',
 'Famalicense AC',
 '{"jornada":5,"volta":1,"jogo_num":28,"home_team":"União Afuradense BelticBasket","away_team":"Famalicense AC","pavilion":"Pav. Escola Sec. Rodrigues Freitas","locality":"Porto","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J5C · UAA Aroso vs CBF Felgueiras BAD',
 'Pav. Escola Básica Manoel Oliveira — Porto','2026-12-03','21:45',
 'CBF Felgueiras BAD',
 '{"jornada":5,"volta":1,"jogo_num":29,"home_team":"UAA Aroso","away_team":"CBF Felgueiras BAD","pavilion":"Pav. Escola Básica Manoel Oliveira","locality":"Porto","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J5C · USC Paredes vs Enesse BC',
 'Pav. Rota dos Móveis — Lordelo-Paredes','2026-11-30','21:30',
 'Enesse BC',
 '{"jornada":5,"volta":1,"jogo_num":30,"home_team":"USC Paredes","away_team":"Enesse BC","pavilion":"Pav. Rota dos Móveis","locality":"Lordelo-Paredes","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 6ª JORNADA  (09-11 dezembro 2026)  ← VOLTA 2
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J6A · CD Póvoa vs Coral Fides OV',
 'Pav. Desportivo Eça de Queirós — Póvoa Varzim','2026-12-09','22:15',
 'Coral Fides OV',
 '{"jornada":6,"volta":2,"jogo_num":31,"home_team":"CD Póvoa","away_team":"Coral Fides OV","pavilion":"Pav. Desportivo Eça de Queirós","locality":"Póvoa Varzim","serie":"A","is_home":true}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J6A · BC Barcelos vs A Portuguesa de Leça FC',
 'Pav. Desportivo Adães — Adães-Barcelos','2026-12-11','22:30',
 'A Portuguesa de Leça FC',
 '{"jornada":6,"volta":2,"jogo_num":32,"home_team":"BC Barcelos","away_team":"A Portuguesa de Leça FC","pavilion":"Pav. Desportivo Adães","locality":"Adães-Barcelos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J6B · Matosinhos Basket CA vs Powertogether Associação',
 'Pav. Municipal Padrão da Légua — Padrão Légua-Matosinhos','2026-12-10','22:45',
 'Powertogether Associação',
 '{"jornada":6,"volta":2,"jogo_num":33,"home_team":"Matosinhos Basket CA","away_team":"Powertogether Associação","pavilion":"Pav. Municipal Padrão da Légua","locality":"Padrão Légua-Matosinhos","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J6B · Famalicense AC vs NCR Valongo',
 'Complexo Desportivo do Vale de São Cosme — S.Cosme-Famalicão','2026-12-10','22:15',
 'NCR Valongo',
 '{"jornada":6,"volta":2,"jogo_num":34,"home_team":"Famalicense AC","away_team":"NCR Valongo","pavilion":"Complexo Desportivo do Vale de São Cosme","locality":"S.Cosme-Famalicão","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J6C · GD André Soares vs CBF Felgueiras BAD',
 'Pav. Maximinos — Braga','2026-12-09','22:15',
 'CBF Felgueiras BAD',
 '{"jornada":6,"volta":2,"jogo_num":35,"home_team":"GD André Soares","away_team":"CBF Felgueiras BAD","pavilion":"Pav. Maximinos","locality":"Braga","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J6C · UAA Aroso vs Enesse BC',
 'Pav. Escola Básica Manoel Oliveira — Porto','2026-12-10','21:45',
 'Enesse BC',
 '{"jornada":6,"volta":2,"jogo_num":36,"home_team":"UAA Aroso","away_team":"Enesse BC","pavilion":"Pav. Escola Básica Manoel Oliveira","locality":"Porto","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 7ª JORNADA  (14-19 dezembro 2026)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J7A · A Portuguesa de Leça FC vs CD Póvoa',
 'Pav. Escola EB 2,3 Perafita — Perafita-Matosinhos','2026-12-17','20:15',
 'CD Póvoa',
 '{"jornada":7,"volta":2,"jogo_num":37,"home_team":"A Portuguesa de Leça FC","away_team":"CD Póvoa","pavilion":"Pav. Escola EB 2,3 Perafita","locality":"Perafita-Matosinhos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J7A · Barca BC vs BC Barcelos',
 'Pav. Municipal Ponte da Barca — Ponte da Barca','2026-12-19','19:00',
 'BC Barcelos',
 '{"jornada":7,"volta":2,"jogo_num":38,"home_team":"Barca BC","away_team":"BC Barcelos","pavilion":"Pav. Municipal Ponte da Barca","locality":"Ponte da Barca","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J7B · Famalicense AC vs Matosinhos Basket CA',
 'Complexo Desportivo do Vale de São Cosme — S.Cosme-Famalicão','2026-12-15','21:00',
 'Matosinhos Basket CA',
 '{"jornada":7,"volta":2,"jogo_num":39,"home_team":"Famalicense AC","away_team":"Matosinhos Basket CA","pavilion":"Complexo Desportivo do Vale de São Cosme","locality":"S.Cosme-Famalicão","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J7B · União Afuradense BelticBasket vs NCR Valongo',
 'Pav. Escola Sec. Rodrigues Freitas — Porto','2026-12-19','22:00',
 'NCR Valongo',
 '{"jornada":7,"volta":2,"jogo_num":40,"home_team":"União Afuradense BelticBasket","away_team":"NCR Valongo","pavilion":"Pav. Escola Sec. Rodrigues Freitas","locality":"Porto","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J7C · Enesse BC vs GD André Soares',
 'Pav. Municipal Prof. António Costeira — Oliv. Azeméis','2026-12-19','17:00',
 'GD André Soares',
 '{"jornada":7,"volta":2,"jogo_num":41,"home_team":"Enesse BC","away_team":"GD André Soares","pavilion":"Pav. Municipal Prof. António Costeira","locality":"Oliv. Azeméis","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J7C · USC Paredes vs UAA Aroso',
 'Pav. Rota dos Móveis — Lordelo-Paredes','2026-12-14','21:30',
 'UAA Aroso',
 '{"jornada":7,"volta":2,"jogo_num":42,"home_team":"USC Paredes","away_team":"UAA Aroso","pavilion":"Pav. Rota dos Móveis","locality":"Lordelo-Paredes","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 8ª JORNADA  (04-09 janeiro 2027)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J8A · CD Póvoa vs Barca BC',
 'Pav. Desportivo Eça de Queirós — Póvoa Varzim','2027-01-06','22:15',
 'Barca BC',
 '{"jornada":8,"volta":2,"jogo_num":43,"home_team":"CD Póvoa","away_team":"Barca BC","pavilion":"Pav. Desportivo Eça de Queirós","locality":"Póvoa Varzim","serie":"A","is_home":true}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J8A · Coral Fides OV vs A Portuguesa de Leça FC',
 'Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar — Gondomar','2027-01-07','22:15',
 'A Portuguesa de Leça FC',
 '{"jornada":8,"volta":2,"jogo_num":44,"home_team":"Coral Fides OV","away_team":"A Portuguesa de Leça FC","pavilion":"Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar","locality":"Gondomar","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J8B · Matosinhos Basket CA vs União Afuradense BelticBasket',
 'Pav. Municipal Padrão da Légua — Padrão Légua-Matosinhos','2027-01-07','22:45',
 'União Afuradense BelticBasket',
 '{"jornada":8,"volta":2,"jogo_num":45,"home_team":"Matosinhos Basket CA","away_team":"União Afuradense BelticBasket","pavilion":"Pav. Municipal Padrão da Légua","locality":"Padrão Légua-Matosinhos","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J8B · Powertogether Associação vs Famalicense AC',
 'Pav. Mun. Prof. Miranda de Carvalho — VN Gaia','2027-01-04','21:30',
 'Famalicense AC',
 '{"jornada":8,"volta":2,"jogo_num":46,"home_team":"Powertogether Associação","away_team":"Famalicense AC","pavilion":"Pav. Mun. Prof. Miranda de Carvalho","locality":"VN Gaia","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J8C · GD André Soares vs USC Paredes',
 'Pav. Maximinos — Braga','2027-01-06','22:15',
 'USC Paredes',
 '{"jornada":8,"volta":2,"jogo_num":47,"home_team":"GD André Soares","away_team":"USC Paredes","pavilion":"Pav. Maximinos","locality":"Braga","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J8C · CBF Felgueiras BAD vs Enesse BC',
 'Pav. Escola Sec. Felgueiras — Felgueiras','2027-01-09','15:30',
 'Enesse BC',
 '{"jornada":8,"volta":2,"jogo_num":48,"home_team":"CBF Felgueiras BAD","away_team":"Enesse BC","pavilion":"Pav. Escola Sec. Felgueiras","locality":"Felgueiras","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 9ª JORNADA  (11-16 janeiro 2027)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J9A · BC Barcelos vs CD Póvoa',
 'Pav. Desportivo Adães — Adães-Barcelos','2027-01-15','22:30',
 'CD Póvoa',
 '{"jornada":9,"volta":2,"jogo_num":49,"home_team":"BC Barcelos","away_team":"CD Póvoa","pavilion":"Pav. Desportivo Adães","locality":"Adães-Barcelos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J9A · Barca BC vs Coral Fides OV',
 'Pav. Municipal Ponte da Barca — Ponte da Barca','2027-01-16','19:00',
 'Coral Fides OV',
 '{"jornada":9,"volta":2,"jogo_num":50,"home_team":"Barca BC","away_team":"Coral Fides OV","pavilion":"Pav. Municipal Ponte da Barca","locality":"Ponte da Barca","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J9B · NCR Valongo vs Matosinhos Basket CA',
 'Pav. Escola Básica Vallis Longus — Valongo','2027-01-12','21:30',
 'Matosinhos Basket CA',
 '{"jornada":9,"volta":2,"jogo_num":51,"home_team":"NCR Valongo","away_team":"Matosinhos Basket CA","pavilion":"Pav. Escola Básica Vallis Longus","locality":"Valongo","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J9B · União Afuradense BelticBasket vs Powertogether Associação',
 'Pav. Escola Sec. Rodrigues Freitas — Porto','2027-01-16','22:00',
 'Powertogether Associação',
 '{"jornada":9,"volta":2,"jogo_num":52,"home_team":"União Afuradense BelticBasket","away_team":"Powertogether Associação","pavilion":"Pav. Escola Sec. Rodrigues Freitas","locality":"Porto","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J9C · UAA Aroso vs GD André Soares',
 'Pav. Escola Básica Manoel Oliveira — Porto','2027-01-14','21:45',
 'GD André Soares',
 '{"jornada":9,"volta":2,"jogo_num":53,"home_team":"UAA Aroso","away_team":"GD André Soares","pavilion":"Pav. Escola Básica Manoel Oliveira","locality":"Porto","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J9C · USC Paredes vs CBF Felgueiras BAD',
 'Pav. Rota dos Móveis — Lordelo-Paredes','2027-01-11','21:30',
 'CBF Felgueiras BAD',
 '{"jornada":9,"volta":2,"jogo_num":54,"home_team":"USC Paredes","away_team":"CBF Felgueiras BAD","pavilion":"Pav. Rota dos Móveis","locality":"Lordelo-Paredes","serie":"C","is_home":false}',
 'Liga','official'),

-- ══════════════════════════════════════════
-- 10ª JORNADA  (18-23 janeiro 2027)
-- ══════════════════════════════════════════
('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J10A · Coral Fides OV vs BC Barcelos',
 'Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar — Gondomar','2027-01-21','22:15',
 'BC Barcelos',
 '{"jornada":10,"volta":2,"jogo_num":55,"home_team":"Coral Fides OV","away_team":"BC Barcelos","pavilion":"Pav. Escola Básica EB 2,3 Júlio Dinis Gondomar","locality":"Gondomar","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J10A · A Portuguesa de Leça FC vs Barca BC',
 'Pav. Escola EB 2,3 Perafita — Perafita-Matosinhos','2027-01-21','20:15',
 'Barca BC',
 '{"jornada":10,"volta":2,"jogo_num":56,"home_team":"A Portuguesa de Leça FC","away_team":"Barca BC","pavilion":"Pav. Escola EB 2,3 Perafita","locality":"Perafita-Matosinhos","serie":"A","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J10B · Powertogether Associação vs NCR Valongo',
 'Pav. Mun. Prof. Miranda de Carvalho — VN Gaia','2027-01-18','21:30',
 'NCR Valongo',
 '{"jornada":10,"volta":2,"jogo_num":57,"home_team":"Powertogether Associação","away_team":"NCR Valongo","pavilion":"Pav. Mun. Prof. Miranda de Carvalho","locality":"VN Gaia","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J10B · Famalicense AC vs União Afuradense BelticBasket',
 'Complexo Desportivo do Vale de São Cosme — S.Cosme-Famalicão','2027-01-19','21:00',
 'União Afuradense BelticBasket',
 '{"jornada":10,"volta":2,"jogo_num":58,"home_team":"Famalicense AC","away_team":"União Afuradense BelticBasket","pavilion":"Complexo Desportivo do Vale de São Cosme","locality":"S.Cosme-Famalicão","serie":"B","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J10C · CBF Felgueiras BAD vs UAA Aroso',
 'Pav. Escola Sec. Felgueiras — Felgueiras','2027-01-20','15:30',
 'UAA Aroso',
 '{"jornada":10,"volta":2,"jogo_num":59,"home_team":"CBF Felgueiras BAD","away_team":"UAA Aroso","pavilion":"Pav. Escola Sec. Felgueiras","locality":"Felgueiras","serie":"C","is_home":false}',
 'Liga','official'),

('ac506a03-ae37-4e3f-94fd-1c03443e339e','jogo','J10C · Enesse BC vs USC Paredes',
 'Pav. Municipal Prof. António Costeira — Oliv. Azeméis','2027-01-23','17:00',
 'USC Paredes',
 '{"jornada":10,"volta":2,"jogo_num":60,"home_team":"Enesse BC","away_team":"USC Paredes","pavilion":"Pav. Municipal Prof. António Costeira","locality":"Oliv. Azeméis","serie":"C","is_home":false}',
 'Liga','official');
