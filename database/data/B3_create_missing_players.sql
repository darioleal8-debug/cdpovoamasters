-- Script B3: Criar players row para utilizadores jogadores sem perfil de jogador.
-- Correr DEPOIS de B2.
-- Só afecta utilizadores com role=jogador ou roles_extra contém "jogador".

-- Preview: ver o que vai ser criado
SELECT
  u.id   AS user_id,
  u.name,
  u.email,
  u.role,
  s.id   AS season_id,
  s.name AS season_name
FROM public.users u
CROSS JOIN (SELECT id, name FROM public.seasons WHERE status = 'ativa' LIMIT 1) s
WHERE (u.role = 'jogador' OR u.roles_extra @> '["jogador"]'::jsonb)
  AND NOT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.user_id = u.id AND p.season_id = s.id
  );

-- Executar criação (descomentar para correr):
/*
INSERT INTO public.players (id, user_id, season_id, created_at)
SELECT
  gen_random_uuid(),
  u.id,
  s.id,
  now()
FROM public.users u
CROSS JOIN (SELECT id FROM public.seasons WHERE status = 'ativa' LIMIT 1) s
WHERE (u.role = 'jogador' OR u.roles_extra @> '["jogador"]'::jsonb)
  AND NOT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.user_id = u.id AND p.season_id = s.id
  );
*/

-- Verificação final: deve devolver 0
SELECT COUNT(*) AS remaining_orphans FROM public.players WHERE user_id IS NULL;
