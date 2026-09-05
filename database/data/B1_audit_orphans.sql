-- Script B1: Auditar jogadores sem conta de utilizador.
-- Correr PRIMEIRO — apenas leitura, sem alterações.
-- Rever o output antes de avançar para B2.

-- Jogadores sem user_id (órfãos)
SELECT
  p.id,
  p.season_id,
  p.name,
  p.email,
  p.number,
  p.position,
  s.name AS season_name
FROM public.players p
LEFT JOIN public.seasons s ON s.id = p.season_id
WHERE p.user_id IS NULL
ORDER BY s.name, p.name;

-- Contagem resumida
SELECT COUNT(*) AS total_orphans FROM public.players WHERE user_id IS NULL;

-- Utilizadores com role=jogador SEM players row na época activa
SELECT
  u.id,
  u.name,
  u.email,
  u.role,
  u.roles_extra
FROM public.users u
WHERE (u.role = 'jogador' OR u.roles_extra @> '["jogador"]'::jsonb)
  AND NOT EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.user_id = u.id
  );
