-- Agrega a atividade (utilização) na base de dados, em vez de ler linhas no servidor
-- (o Supabase devolve no máximo 1000 linhas por pedido, o que truncava o painel).
create or replace function public.analytics_usage_summary(p_days int default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_days  int         := least(365, greatest(7, coalesce(p_days, 30)));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_today timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_today_date date   := (now() at time zone 'utc')::date;
begin
  return jsonb_build_object(
    'total_events', (select count(*) from user_activity_logs where created_at >= v_since),
    'active_today', (select count(distinct user_id) from user_activity_logs
                      where created_at >= greatest(v_since, v_today)),
    'active_week',  (select count(distinct user_id) from user_activity_logs
                      where created_at >= greatest(v_since, now() - interval '7 days')),
    'active_month', (select count(distinct user_id) from user_activity_logs
                      where created_at >= greatest(v_since, now() - interval '30 days')),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(v_today_date - (v_days - 1), v_today_date, interval '1 day') d
      left join (
        select (created_at at time zone 'utc')::date as dia, count(*) as n
        from user_activity_logs where created_at >= v_since group by 1
      ) c on c.dia = d::date
    ),
    'dow', (
      select coalesce(jsonb_agg(coalesce(x.n, 0) order by g), '[]'::jsonb)
      from generate_series(0, 6) g
      left join (
        select extract(dow from created_at at time zone 'utc')::int as dw, count(*) as n
        from user_activity_logs where created_at >= now() - interval '90 days' group by 1
      ) x on x.dw = g
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('ym', to_char(m, 'YYYY-MM'), 'count', coalesce(x.n, 0)) order by m), '[]'::jsonb)
      from generate_series(
        date_trunc('month', now() at time zone 'utc') - interval '11 months',
        date_trunc('month', now() at time zone 'utc'),
        interval '1 month') m
      left join (
        select date_trunc('month', created_at at time zone 'utc') as mm, count(*) as n
        from user_activity_logs where created_at >= now() - interval '365 days' group by 1
      ) x on x.mm = m
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('page', page, 'count', n)), '[]'::jsonb)
      from (
        select page, count(*) as n from user_activity_logs
        where created_at >= v_since and page is not null
        group by page order by n desc, page limit 15
      ) t
    ),
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'events', n, 'last_seen', ls)), '[]'::jsonb)
      from (
        select user_id, count(*) as n, max(created_at) as ls
        from user_activity_logs
        where created_at >= v_since and user_id is not null
        group by user_id
      ) t
    )
  );
end;
$$;

-- Só o servidor (service_role) a pode chamar.
revoke all on function public.analytics_usage_summary(int) from public, anon, authenticated;
grant execute on function public.analytics_usage_summary(int) to service_role;
