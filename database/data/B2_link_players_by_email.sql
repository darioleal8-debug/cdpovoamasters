-- Script B2: Ligar jogadores órfãos a contas de utilizador pelo email.
-- Correr DEPOIS de B1 e rever o output.
-- Só actualiza registos onde players.email = users.email (match exacto).

-- Preview (sem alterar): ver o que vai ser ligado
SELECT
  p.id      AS player_id,
  p.name    AS player_name,
  p.email   AS player_email,
  u.id      AS user_id,
  u.name    AS user_name,
  u.email   AS user_email
FROM public.players p
JOIN public.users u ON u.email = p.email
WHERE p.user_id IS NULL
ORDER BY p.name;

-- Executar ligação (descomentar para correr):
/*
UPDATE public.players p
SET user_id = u.id
FROM public.users u
WHERE p.user_id IS NULL
  AND p.email IS NOT NULL
  AND p.email = u.email;
*/

-- Verificar divergências de nome após ligação
SELECT
  u.name  AS users_name,
  p.name  AS players_name,
  u.email
FROM public.users u
JOIN public.players p ON p.user_id = u.id
WHERE p.name IS NOT NULL AND u.name != p.name
ORDER BY u.name;
