-- 073_roster_source_of_truth.sql
-- Fonte única de verdade para o plantel activo:
--   1. Função calc_age_pt: idade em Europe/Lisbon (evita off-by-one na mudança de dia)
--   2. Índice único de camisola por temporada (excluindo contas de teste)
--   3. View v_active_roster: jogadores activos da temporada activa (sem contas de teste)
--
-- IMPORTANTE: Mostrar ao utilizador para revisão antes de aplicar.
-- Aplicar no Supabase SQL Editor (projeto uhszagzrhdfzpfztuati).

BEGIN;

-- ── 1. Função calc_age_pt ────────────────────────────────────────────────────
-- Calcula a idade em anos de acordo com o fuso horário de Lisboa,
-- evitando o off-by-one quando a meia-noite UTC cai antes da meia-noite PT.

CREATE OR REPLACE FUNCTION public.calc_age_pt(p_birth_date date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(year FROM age(
    (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon')::date,
    p_birth_date
  ))::integer
$$;

COMMENT ON FUNCTION public.calc_age_pt(date) IS
  'Calcula a idade em anos usando o fuso Europe/Lisbon. '
  'Substitui cálculos baseados em CURRENT_DATE que usam UTC.';

GRANT EXECUTE ON FUNCTION public.calc_age_pt(date) TO authenticated;

-- ── 2. Índice único de camisola por temporada ────────────────────────────────
-- Dois jogadores não podem ter o mesmo número (não nulo) numa temporada.
-- Contas de teste devem ter number = NULL para não colidir.
-- PostgreSQL não suporta subqueries em predicados de índice — usar condição simples.

DROP INDEX IF EXISTS public.uq_players_number_per_season;

CREATE UNIQUE INDEX uq_players_number_per_season
  ON public.players (season_id, number)
  WHERE number IS NOT NULL;

-- ── 3. View v_active_roster ──────────────────────────────────────────────────
-- Plantel activo da temporada activa, sem contas de teste.
-- Fonte única a usar em dashboards de contagem e exportações.

CREATE OR REPLACE VIEW public.v_active_roster
WITH (security_invoker = true)
AS
SELECT
  pl.id                                    AS player_id,
  pl.season_id,
  pl.user_id,
  u.name                                   AS name,
  pl.number,
  pl.position,
  pl.birth_date,
  pl.age,
  public.calc_age_pt(pl.birth_date::date)  AS age_pt,
  pl.height,
  pl.weight,
  pl.photo_url,
  u.is_test_account
FROM public.players pl
JOIN public.seasons s ON s.id = pl.season_id AND s.status = 'ativa'
LEFT JOIN public.users u ON u.id = pl.user_id
WHERE (u.is_test_account IS NULL OR u.is_test_account = false);

COMMENT ON VIEW public.v_active_roster IS
  'Plantel activo da temporada activa, excluindo contas de teste. '
  'Usar em contagens, exportações e dashboards de gestão.';

GRANT SELECT ON public.v_active_roster TO authenticated;

COMMIT;
