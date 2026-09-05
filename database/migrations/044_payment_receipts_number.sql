-- Adiciona número de recibo (formato AAAA-MM-NNN) à tabela payment_receipts.
-- O número é gerado no momento do envio e fica persistido para reenvios.
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS receipt_number text;

-- Índice para acelerar a query MAX que gera o próximo número sequencial
CREATE INDEX IF NOT EXISTS idx_payment_receipts_number
  ON payment_receipts(receipt_number)
  WHERE receipt_number IS NOT NULL;
