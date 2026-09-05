-- Adicionar colunas de tracking de recibo à tabela player_payments
ALTER TABLE player_payments
  ADD COLUMN IF NOT EXISTS receipt_sent    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_error   text;

CREATE INDEX IF NOT EXISTS idx_player_payments_receipt_pending
  ON player_payments(created_at)
  WHERE receipt_sent = false AND status = 'paid';
