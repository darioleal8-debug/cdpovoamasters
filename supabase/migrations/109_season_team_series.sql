-- Séries (grupos) da Liga INATEL por temporada.
-- A série é guardada na inscrição da equipa na competição/temporada (season_teams),
-- para que numa temporada futura a composição possa mudar sem afetar o histórico.

alter table public.season_teams
  add column if not exists series text;

alter table public.season_teams
  drop constraint if exists season_teams_series_check;

alter table public.season_teams
  add constraint season_teams_series_check
  check (series is null or series ~ '^[A-Z]$');

comment on column public.season_teams.series is
  'Letra da série/grupo da equipa nesta competição (A, B, C…). NULL = sem série atribuída.';

-- Composição 2026/27 (Liga INATEL)
with comp as (
  select id from public.competitions where slug = 'liga-inatel'
),
assign(team_name, series) as (
  values
    ('CD Póvoa', 'A'),
    ('Coral Fides OV', 'A'),
    ('A Portuguesa de Leça FC', 'A'),
    ('Barca BC', 'A'),
    ('BC Barcelos', 'A'),
    ('Matosinhos Basket CA', 'B'),
    ('Powertogether Associação', 'B'),
    ('Famalicense AC', 'B'),
    ('União Afuradense BelticBasket', 'B'),
    ('NCR Valongo', 'B'),
    ('GD André Soares', 'C'),
    ('CBF Felgueiras BAD', 'C'),
    ('Enesse BC', 'C'),
    ('USC Paredes', 'C'),
    ('UAA Aroso', 'C')
)
update public.season_teams st
set series = a.series
from assign a
join public.league_teams lt on lt.name = a.team_name
where st.team_id = lt.id
  and st.competition_id = (select id from comp);
