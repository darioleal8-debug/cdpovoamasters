-- Migration 042: Criar vista v_roster — JOIN entre users e players.
--
-- Esta view substitui queries directas a players em componentes que precisam
-- do nome/email do utilizador. Usa INNER JOIN, portanto só mostra jogadores
-- que têm user_id preenchido (comportamento correcto pós-migration 040).
--
-- Campos expostos:
--   user_id, name, email, phone, active, roles_extra  → de users
--   player_id, season_id, number, position, height,
--   weight, age, birth_date, photo_url, team_id       → de players
--
-- Pode ser criada antes da migration 041 (os campos name/email vêm de users,
-- não de players, por isso não é afectada pela remoção das colunas).

CREATE OR REPLACE VIEW public.v_roster AS
SELECT
  p.id          AS id,          -- alias para compatibilidade com consultas que usam player.id
  u.id          AS user_id,
  u.name,
  u.email,
  u.phone,
  u.active,
  u.roles_extra,
  p.id          AS player_id,
  p.season_id,
  p.number,
  p.position,
  p.height,
  p.weight,
  p.age,
  p.birth_date,
  p.photo_url,
  p.team_id,
  p.created_at
FROM public.users u
INNER JOIN public.players p ON p.user_id = u.id
WHERE u.role = 'jogador'
   OR u.roles_extra @> '["jogador"]'::jsonb;

-- Conceder acesso de leitura a utilizadores autenticados
GRANT SELECT ON public.v_roster TO authenticated;

NOTIFY pgrst, 'reload schema';
