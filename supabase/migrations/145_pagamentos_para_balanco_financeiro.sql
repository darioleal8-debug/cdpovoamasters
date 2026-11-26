-- Quotas e inscrições pagas passam a entrar automaticamente no balanço do clube (Gestão Financeira).
-- O balanço soma financial_entries; até aqui player_payments (quotas) e player_charges (inscrições/outros
-- tipos) nunca geravam lançamentos. Os triggers mantêm o lançamento em sincronia (criar, alterar, anular, apagar).

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS player_charge_id uuid REFERENCES public.player_charges(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_entries_player_payment ON public.financial_entries(player_payment_id) WHERE player_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_entries_player_charge  ON public.financial_entries(player_charge_id)  WHERE player_charge_id  IS NOT NULL;

-- Quotas mensais
CREATE OR REPLACE FUNCTION public.sync_cota_financial_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM financial_entries WHERE player_payment_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status IN ('paid','partial') AND NEW.amount > 0 THEN
    SELECT u.name INTO v_name FROM players p JOIN users u ON u.id = p.user_id WHERE p.id = NEW.player_id;
    INSERT INTO financial_entries (amount, description, category, source_type, player_payment_id, player_id, player_name, entry_date, season_id, created_by, club_id)
    VALUES (NEW.amount, 'Cota — ' || coalesce(v_name,'Jogador'), 'cota', 'cota_jogador', NEW.id, NEW.player_id, v_name,
            coalesce(NEW.payment_date, current_date), NEW.season_id, (SELECT id FROM users WHERE id = NEW.created_by), NEW.club_id)
    ON CONFLICT (player_payment_id) WHERE player_payment_id IS NOT NULL DO UPDATE
      SET amount = EXCLUDED.amount, entry_date = EXCLUDED.entry_date, season_id = EXCLUDED.season_id,
          player_name = EXCLUDED.player_name, description = EXCLUDED.description, updated_at = now();
  ELSE
    DELETE FROM financial_entries WHERE player_payment_id = NEW.id;
  END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_sync_cota_financial_entry ON public.player_payments;
CREATE TRIGGER trg_sync_cota_financial_entry
  AFTER INSERT OR UPDATE OR DELETE ON public.player_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_cota_financial_entry();

-- Inscrição anual e restantes tipos de pagamento
CREATE OR REPLACE FUNCTION public.sync_charge_financial_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_name text; v_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM financial_entries WHERE player_charge_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status IN ('paid','partial') AND NEW.amount > 0 THEN
    SELECT u.name INTO v_name FROM players p JOIN users u ON u.id = p.user_id WHERE p.id = NEW.player_id;
    SELECT name INTO v_type FROM payment_types WHERE id = NEW.payment_type_id;
    INSERT INTO financial_entries (amount, description, category, source_type, player_charge_id, player_id, player_name, entry_date, season_id, created_by, club_id)
    VALUES (NEW.amount, coalesce(v_type,'Pagamento') || ' — ' || coalesce(v_name,'Jogador'),
            CASE WHEN v_type ILIKE 'inscri%' THEN 'inscricao' ELSE 'outro' END, 'pagamento_jogador',
            NEW.id, NEW.player_id, v_name, coalesce(NEW.payment_date, current_date), NEW.season_id,
            (SELECT id FROM users WHERE id = NEW.created_by), NEW.club_id)
    ON CONFLICT (player_charge_id) WHERE player_charge_id IS NOT NULL DO UPDATE
      SET amount = EXCLUDED.amount, entry_date = EXCLUDED.entry_date, season_id = EXCLUDED.season_id,
          player_name = EXCLUDED.player_name, description = EXCLUDED.description, category = EXCLUDED.category, updated_at = now();
  ELSE
    DELETE FROM financial_entries WHERE player_charge_id = NEW.id;
  END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_sync_charge_financial_entry ON public.player_charges;
CREATE TRIGGER trg_sync_charge_financial_entry
  AFTER INSERT OR UPDATE OR DELETE ON public.player_charges
  FOR EACH ROW EXECUTE FUNCTION public.sync_charge_financial_entry();

-- Backfill: pagamentos já registados e ainda sem lançamento
UPDATE public.player_payments SET amount = amount WHERE status IN ('paid','partial') AND amount > 0;
UPDATE public.player_charges  SET amount = amount WHERE status IN ('paid','partial') AND amount > 0;
