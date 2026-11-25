-- 143_game_availability_roster_por_clube.sql
-- Calendário único da Liga: os jogos da Liga têm a época do CD Póvoa (events.season_id), mas cada clube
-- opera sobre o SEU plantel. game_availability_roster passa a devolver o plantel da época do próprio
-- clube do utilizador:
--   1) se a época do jogo é de um clube do utilizador (jogos do próprio clube) → essa época (igual a antes);
--   2) senão → a época ativa mais recente de um clube do utilizador (jogos partilhados da Liga).
-- O Master Admin (my_club_ids = todos os clubes) continua a ver a época do jogo.
-- Sem época do clube devolve zero linhas — nunca o plantel de outro clube.
-- NÃO ALTERA dados nem tabelas; só a função. Rollback: reaplicar a definição anterior (join p.season_id = e.season_id).

CREATE OR REPLACE FUNCTION public.game_availability_roster(p_game_id uuid)
RETURNS TABLE(player_id uuid, name text, jersey_number integer, status text, reason_code text, reason_text text, responded_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  with ev as (
    select e.id, e.season_id from public.events e where e.id = p_game_id
  ),
  op as (
    select coalesce(
      (select s.id from public.seasons s join ev on s.id = ev.season_id
        where s.club_id = any (public.my_club_ids())),
      (select s.id from public.seasons s
        where s.club_id = any (public.my_club_ids()) and s.status = 'ativa'
        order by s.start_date desc limit 1)
    ) as season_id
  )
  select
    p.id,
    u.name::text,
    p.number,
    a.status,
    a.reason_code,
    a.reason_text,
    a.responded_at
  from ev
  join op on op.season_id is not null
  join public.players p on p.season_id = op.season_id
  join public.users   u on u.id = p.user_id and u.active
  left join public.game_availability a
         on a.game_id = ev.id and a.player_id = p.id
  where public.is_trainer_or_above()
  order by u.name
$function$;
