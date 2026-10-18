import { EDITABLE_PAYMENT_FIELDS } from "./update-fields";

const NUMERIC = new Set(["amount", "amount_due"]);

function same(field: string, a: unknown, b: unknown): boolean {
  if (NUMERIC.has(field) && a !== null && b !== null && a !== undefined && b !== undefined) {
    return Number(a) === Number(b); // NUMERIC pode chegar como string do PostgREST
  }
  return (a ?? null) === (b ?? null);
}

/**
 * Houve alteração real? Só olha para campos PRESENTES no pedido; um valor explícito null
 * (limpar notas/método) é uma alteração — o antigo `allowed.x ?? before.x` ignorava-o (QUO-09).
 */
export function paymentChanged(before: Record<string, unknown>, allowed: Record<string, unknown>): boolean {
  return EDITABLE_PAYMENT_FIELDS.some((f) => f in allowed && !same(f, before[f], allowed[f]));
}
