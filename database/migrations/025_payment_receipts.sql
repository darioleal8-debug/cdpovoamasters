-- Tabela de auditoria de recibos de pagamento enviados por email
CREATE TABLE IF NOT EXISTS payment_receipts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid        NOT NULL REFERENCES players(id)          ON DELETE CASCADE,
  payment_id  uuid        NOT NULL REFERENCES player_payments(id)  ON DELETE CASCADE,
  email       text,
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id)
);

ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_receipts_admin" ON payment_receipts;

CREATE POLICY "payment_receipts_admin"
  ON payment_receipts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'treinador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'treinador')
    )
  );

CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_id ON payment_receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_unsent
  ON payment_receipts(created_at)
  WHERE sent_at IS NULL;
