-- Rollback da 141: remove tipos/registos e repõe o isolamento anterior (Master Admin vê todos os clubes).
DROP TRIGGER IF EXISTS clubs_seed_payment_types ON public.clubs;
DROP FUNCTION IF EXISTS public.seed_payment_types_for_club();
DROP TABLE IF EXISTS public.player_charges;
DROP TABLE IF EXISTS public.payment_types;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['player_payments', 'player_payments_history', 'payment_receipts', 'payments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS club_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY club_isolation ON public.%I AS RESTRICTIVE FOR ALL USING (club_id = ANY (public.my_club_ids()))',
      t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.my_member_club_ids();
NOTIFY pgrst, 'reload schema';
