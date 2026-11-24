import { z } from "zod";

/** Tipo de pagamento definido pelo clube (cobrado uma vez por época e por jogador). */
export interface PaymentType {
  id: string;
  name: string;
  default_amount: number;
  sort_order: number;
}

export type ChargeStatus = "paid" | "partial" | "late" | "exempt";
export type ChargeMethod = "mbway" | "transferencia" | "numerario" | "cheque" | "outro";

export interface PlayerCharge {
  id: string;
  season_id: string;
  player_id: string;
  payment_type_id: string;
  amount_due: number;
  amount: number;
  status: ChargeStatus;
  method: ChargeMethod | null;
  notes: string | null;
  payment_date: string | null;
}

export const PAYMENT_TYPE_NAME_MAX = 60;
const MONEY_MAX = 100_000;

export const PaymentTypeCreateSchema = z.object({
  name: z.string().trim().min(1, "Escreve o nome do tipo de pagamento").max(PAYMENT_TYPE_NAME_MAX, `Nome com no máximo ${PAYMENT_TYPE_NAME_MAX} caracteres`),
  default_amount: z.coerce.number().min(0, "Valor inválido").max(MONEY_MAX, "Valor demasiado alto").default(0),
});

export const PaymentTypePatchSchema = PaymentTypeCreateSchema.partial().refine(
  (v) => v.name !== undefined || v.default_amount !== undefined,
  { message: "Nada para atualizar" },
);

export const ChargeUpsertSchema = z.object({
  season_id: z.string().uuid(),
  payment_type_id: z.string().uuid(),
  player_id: z.string().uuid().nullish(),
  user_id: z.string().uuid().nullish(),
  amount: z.coerce.number().min(0).max(MONEY_MAX).default(0),
  amount_due: z.coerce.number().min(0).max(MONEY_MAX).default(0),
  status: z.enum(["paid", "partial", "late", "exempt"]).default("paid"),
  method: z.enum(["mbway", "transferencia", "numerario", "cheque", "outro"]).nullish(),
  notes: z.string().trim().max(500).nullish(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullish(),
}).refine((v) => !!v.player_id || !!v.user_id, { message: "player_id ou user_id são obrigatórios" });

/** Valores a gravar: isento zera os montantes; sem data de pagamento só se não houver nada pago. */
export function normalizeCharge(v: z.infer<typeof ChargeUpsertSchema>) {
  const exempt = v.status === "exempt";
  return {
    amount: exempt ? 0 : v.amount,
    amount_due: exempt ? 0 : v.amount_due,
    status: v.status,
    method: exempt ? null : (v.method ?? null),
    notes: v.notes || null,
    payment_date: v.payment_date || null,
  };
}

/** Estado de uma célula "jogador × tipo" quando ainda não há registo. */
export function chargeSummary(charges: PlayerCharge[], playerIds: string[]) {
  let paid = 0, due = 0, pending = 0;
  for (const pid of playerIds) {
    const c = charges.find((x) => x.player_id === pid);
    if (!c) { pending++; continue; }
    if (c.status === "exempt") continue;
    paid += Number(c.amount);
    due += Number(c.amount_due);
    if (c.status !== "paid") pending++;
  }
  return { paid, due, missing: Math.max(0, due - paid), pending };
}
