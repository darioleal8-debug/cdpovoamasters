-- 045_availability.sql
-- Disponibilidade de jogadores para treinos e jogos.
--
-- 1. training_rsvps tinha RLS ligado mas nenhuma policy → ninguém conseguia
--    ler nem gravar confirmações. Adiciona as policies em falta.
-- 2. Nova tabela game_availability (disponibilidade do jogador para um jogo).
-- 3. RPCs para listar o plantel com o estado de cada jogador:
--      training_rsvp_roster  → todos os membros activos (motivos só para treinador+)
--      game_availability_roster → apenas treinador+

-- ── 1. training_rsvps: policies ──────────────────────────────────────────────

create policy training_rsvps_select on public.training_rsvps
  for select to authenticated
  using (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = training_rsvps.player_id and p.user_id = (select auth.uid())
    )
  );

create policy training_rsvps_insert on public.training_rsvps
  for insert to authenticated
  with check (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = training_rsvps.player_id and p.user_id = (select auth.uid())
    )
  );

create policy training_rsvps_update on public.training_rsvps
  for update to authenticated
  using (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = training_rsvps.player_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = training_rsvps.player_id and p.user_id = (select auth.uid())
    )
  );

create policy training_rsvps_delete on public.training_rsvps
  for delete to authenticated
  using (public.is_trainer_or_above());

-- ── 2. game_availability ─────────────────────────────────────────────────────

create table public.game_availability (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.events(id)  on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  status       text not null check (status in ('available', 'unavailable')),
  reason_code  text check (reason_code in ('lesao', 'trabalho', 'viagem', 'outro')),
  reason_text  text check (char_length(reason_text) <= 140),
  responded_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id) on delete set null,
  unique (game_id, player_id)
);

create index game_availability_player_id_idx on public.game_availability (player_id);
create index game_availability_updated_by_idx on public.game_availability (updated_by);

alter table public.game_availability enable row level security;

revoke all on public.game_availability from anon;
grant select, insert, update, delete on public.game_availability to authenticated;

create policy game_availability_select on public.game_availability
  for select to authenticated
  using (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = game_availability.player_id and p.user_id = (select auth.uid())
    )
  );

create policy game_availability_insert on public.game_availability
  for insert to authenticated
  with check (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = game_availability.player_id and p.user_id = (select auth.uid())
    )
  );

create policy game_availability_update on public.game_availability
  for update to authenticated
  using (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = game_availability.player_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    public.is_trainer_or_above()
    or exists (
      select 1 from public.players p
      where p.id = game_availability.player_id and p.user_id = (select auth.uid())
    )
  );

create policy game_availability_delete on public.game_availability
  for delete to authenticated
  using (public.is_trainer_or_above());

-- ── 3. RPCs ──────────────────────────────────────────────────────────────────

-- Plantel de um treino com o estado de cada jogador.
-- Qualquer utilizador activo vê quem vai / não vai; os motivos só para treinador+.
create or replace function public.training_rsvp_roster(p_training_id uuid)
returns table (
  player_id     uuid,
  name          text,
  jersey_number integer,
  status        text,
  reason_code   text,
  reason_text   text,
  responded_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    u.name::text,
    p.number,
    r.status,
    case when public.is_trainer_or_above() then r.reason_code end,
    case when public.is_trainer_or_above() then r.reason_text end,
    r.responded_at
  from public.trainings t
  join public.players p on p.season_id = t.season_id
  join public.users   u on u.id = p.user_id and u.active
  left join public.training_rsvps r
         on r.training_id = t.id and r.player_id = p.id
  where t.id = p_training_id
    and exists (
      select 1 from public.users me
      where me.id = (select auth.uid()) and me.active
    )
  order by u.name
$$;

revoke all on function public.training_rsvp_roster(uuid) from public, anon;
grant execute on function public.training_rsvp_roster(uuid) to authenticated;

-- Plantel de um jogo com a disponibilidade de cada jogador — só treinador+.
create or replace function public.game_availability_roster(p_game_id uuid)
returns table (
  player_id     uuid,
  name          text,
  jersey_number integer,
  status        text,
  reason_code   text,
  reason_text   text,
  responded_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    u.name::text,
    p.number,
    a.status,
    a.reason_code,
    a.reason_text,
    a.responded_at
  from public.events e
  join public.players p on p.season_id = e.season_id
  join public.users   u on u.id = p.user_id and u.active
  left join public.game_availability a
         on a.game_id = e.id and a.player_id = p.id
  where e.id = p_game_id
    and public.is_trainer_or_above()
  order by u.name
$$;

revoke all on function public.game_availability_roster(uuid) from public, anon;
grant execute on function public.game_availability_roster(uuid) to authenticated;
