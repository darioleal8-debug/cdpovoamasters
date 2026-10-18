export const EDITABLE_PAYMENT_FIELDS = ["amount", "amount_due", "status", "method", "notes", "payment_date"] as const;
export type PaymentUpdate = Partial<Record<(typeof EDITABLE_PAYMENT_FIELDS)[number], unknown>>;

/** Lista branca de colunas que o PUT de um pagamento pode alterar (QUO-01, QUO-06). */
export function pickPaymentUpdate(body: Record<string, unknown>): PaymentUpdate {
  const out: PaymentUpdate = {};
  for (const k of EDITABLE_PAYMENT_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

export const DEFAULT_MONTHLY_FEE = 20;

/** Valor devido a partir do input do formulário: 0 é válido (isenção); vazio/inválido usa a quota por omissão (QUO-07). */
export function parseAmountDue(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_FEE;
}
