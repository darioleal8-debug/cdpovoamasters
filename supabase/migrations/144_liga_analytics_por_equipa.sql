-- Analytics do site da Liga por equipa (Gestão HoopHub, só Master Admin).
-- Atividade dos delegados da equipa + visitas à página pública da equipa. Idempotente.
-- Só service_role as chama (a rota valida o Master Admin).

create or replace function public.liga_teams_summary(p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := least(365, greatest(1, coalesce(p_days, 30)));
  v_tz   text := 'Europe/Lisbon';
  v_from timestamptz := (((now() at time zone v_tz)::date - (v_days - 1))::timestamp at time zone v_tz);
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', lt.id,
      'delegate_views', coalesce(a.v, 0),
      'active_delegates', coalesce(a.u, 0),
      'last_seen', a.ls,
      'team_page_views', coalesce(b.v, 0)
    )), '[]'::jsonb)
    from league_teams lt
    left join (
      select team_id, count(*) v, count(distinct user_id) u, max(created_at) ls
      from liga_page_views where created_at >= v_from and team_id is not null group by 1
    ) a on a.team_id = lt.id
    left join (
      select t.id, count(*) v
      from liga_page_views pv
      join league_teams t on t.slug is not null
        and (pv.path = '/liga-inatel/equipas/' || t.slug or pv.path like '/liga-inatel/equipas/' || t.slug || '/%')
      where pv.created_at >= v_from group by 1
    ) b on b.id = lt.id
  );
end;
$$;

create or replace function public.liga_team_analytics(p_team uuid, p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days  int := least(365, greatest(1, coalesce(p_days, 30)));
  v_tz    text := 'Europe/Lisbon';
  v_today date := (now() at time zone v_tz)::date;
  v_from  timestamptz := ((v_today - (v_days - 1))::timestamp at time zone v_tz);
  v_slug  text;
  v_res   jsonb;
begin
  select slug into v_slug from league_teams where id = p_team;

  with dv as (
    select * from liga_page_views where created_at >= v_from and team_id = p_team
  ), tp as (
    select * from liga_page_views
    where created_at >= v_from and v_slug is not null
      and (path = '/liga-inatel/equipas/' || v_slug or path like '/liga-inatel/equipas/' || v_slug || '/%')
  ), days as (
    select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as dd
  )
  select jsonb_build_object(
    'period_days', v_days,
    'overview', jsonb_build_object(
      'delegate_views',     (select count(*) from dv),
      'delegate_sessions',  (select count(distinct session_id) from dv),
      'active_delegates',   (select count(distinct user_id) from dv where user_id is not null),
      'team_page_views',    (select count(*) from tp),
      'team_page_visitors', (select count(distinct visitor_id) from tp),
      'last_seen',          (select max(created_at) from dv)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', days.dd, 'delegate_views', coalesce(a.n, 0), 'team_page_views', coalesce(b.n, 0)
      ) order by days.dd), '[]'::jsonb)
      from days
      left join (select (created_at at time zone v_tz)::date x, count(*) n from dv group by 1) a on a.x = days.dd
      left join (select (created_at at time zone v_tz)::date x, count(*) n from tp group by 1) b on b.x = days.dd
    ),
    'pages', (
      select coalesce(jsonb_agg(p order by p.views desc), '[]'::jsonb) from (
        select regexp_replace(path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'g') as path,
               count(*) as views
        from dv group by 1 order by 2 desc limit 15
      ) p
    ),
    'users', (
      select coalesce(jsonb_agg(u order by u.views desc), '[]'::jsonb) from (
        select dv.user_id, coalesce(pu.name, au.email) as name, au.email,
               count(*) as views, count(distinct dv.session_id) as sessions, max(dv.created_at) as last_seen
        from dv
        left join auth.users au on au.id = dv.user_id
        left join public.users pu on pu.id = dv.user_id
        where dv.user_id is not null
        group by dv.user_id, pu.name, au.email
        order by 4 desc limit 50
      ) u
    )
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.liga_teams_summary(int) from public, anon, authenticated;
revoke all on function public.liga_team_analytics(uuid, int) from public, anon, authenticated;
grant execute on function public.liga_teams_summary(int) to service_role;
grant execute on function public.liga_team_analytics(uuid, int) to service_role;
