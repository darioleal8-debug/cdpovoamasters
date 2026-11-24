-- 141_pagamentos_clube_e_tipos.sql
--
-- 1) Isolamento: nos pagamentos, ninguém (nem o Master Admin) vê dados de clubes a que não está afeto.
--    my_club_ids() devolve TODOS os clubes ao Master Admin; para os pagamentos passa a usar-se
--    my_member_club_ids(), que só devolve os clubes de que o utilizador é membro ativo.
--    O Master Admin continua a gerir clubes/membros pelas rotas /api/master (service role), que não passam por aqui.
--
-- 2) Tipos de pagamento por clube (além das quotas mensais, que continuam em player_payments):
--    * payment_types   — tipologias definidas por cada clube (ex.: "Inscrição anual", "Equipamento", "Seguro").
--                        Cada tipo é cobrado UMA vez por época e por jogador.
--    * player_charges  — o estado de cada jogador em cada tipo/época (pago, parcial, em atraso, isento).
--    Cada clube recebe "Inscrição anual" de origem; pode renomear, apagar e acrescentar tipos.
--    Eliminar um tipo com registos arquiva-o (active=false) para não perder histórico; sem registos apaga-o.
--
-- Idempotente. Rollback: supabase/rollbacks/141_pagamentos_clube_e_tipos_rollback.sql

-- ─── 1. Isolamento estrito por clube nos pagamentos ───────────────────────────
CREATE OR REPLACE FUNCTION public.my_member_club_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT array_agg(m.club_id)
       FROM public.club_members m
       JOIN public.clubs c ON c.id = m.club_id
      WHERE m.user_id = (SELECT auth.uid()) AND m.active AND c.active),
    '{}'::uuid[])
$$;

REVOKE ALL ON FUNCTION public.my_member_club_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_member_club_ids() TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['player_payments', 'player_payments_history', 'payment_receipts', 'payments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS club_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY club_isolation ON public.%I AS RESTRICTIVE FOR ALL USING (club_id = ANY (public.my_member_club_ids()))',
      t);
  END LOOP;
END $$;

-- ─── 2. Tipos de pagamento ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  default_amount  numeric(10,2) NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Nome único por clube entre os tipos ativos (arquivados não bloqueiam recriar o nome)
CREATE UNIQUE INDEX IF NOT EXISTS payment_types_club_name_uq
  ON public.payment_types (club_id, lower(btrim(name))) WHERE active;
CREATE INDEX IF NOT EXISTS payment_types_club_idx ON public.payment_types (club_id, sort_order);

DROP TRIGGER IF EXISTS payment_types_set_updated_at ON public.payment_types;
CREATE TRIGGER payment_types_set_updated_at
  BEFORE UPDATE ON public.payment_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_types_select_members ON public.payment_types;
CREATE POLICY payment_types_select_members ON public.payment_types
  FOR SELECT TO authenticated
  USING (club_id = ANY (public.my_member_club_ids()));

REVOKE INSERT, UPDATE, DELETE ON public.payment_types FROM anon, authenticated;

-- ─── 3. Registos por jogador / tipo / época ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_charges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_id        uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  player_id        uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  payment_type_id  uuid NOT NULL REFERENCES public.payment_types(id) ON DELETE RESTRICT,
  amount_due       numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  amount           numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status           text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'partial', 'late', 'exempt')),
  method           text CHECK (method IN ('mbway', 'transferencia', 'numerario', 'cheque', 'outro')),
  notes            text,
  payment_date     date,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_charges_one_per_season UNIQUE (season_id, player_id, payment_type_id)
);

CREATE INDEX IF NOT EXISTS player_charges_club_season_idx ON public.player_charges (club_id, season_id);
CREATE INDEX IF NOT EXISTS player_charges_type_idx ON public.player_charges (payment_type_id);
CREATE INDEX IF NOT EXISTS player_charges_player_idx ON public.player_charges (player_id);

DROP TRIGGER IF EXISTS player_charges_set_updated_at ON public.player_charges;
CREATE TRIGGER player_charges_set_updated_at
  BEFORE UPDATE ON public.player_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.player_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_charges_select_members ON public.player_charges;
CREATE POLICY player_charges_select_members ON public.player_charges
  FOR SELECT TO authenticated
  USING (club_id = ANY (public.my_member_club_ids()));

REVOKE INSERT, UPDATE, DELETE ON public.player_charges FROM anon, authenticated;

-- ─── 4. Tipo de origem em cada clube ──────────────────────────────────────────
INSERT INTO public.payment_types (club_id, name, default_amount, sort_order)
SELECT c.id, 'Inscrição anual', 0, 0
  FROM public.clubs c
 WHERE NOT EXISTS (SELECT 1 FROM public.payment_types t WHERE t.club_id = c.id);

CREATE OR REPLACE FUNCTION public.seed_payment_types_for_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.payment_types (club_id, name, default_amount, sort_order)
  VALUES (NEW.id, 'Inscrição anual', 0, 0);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clubs_seed_payment_types ON public.clubs;
CREATE TRIGGER clubs_seed_payment_types
  AFTER INSERT ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.seed_payment_types_for_club();

NOTIFY pgrst, 'reload schema';
