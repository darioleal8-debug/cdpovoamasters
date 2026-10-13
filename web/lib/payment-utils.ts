import type { Season, PlayerPaymentStatus, PlayerPaymentWithPlayer } from "@/types/database";

export interface SeasonMonth {
  month: number;
  year:  number;
  label: string;
}

const MONTH_NAMES_PT = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];
const MONTH_NAMES_FULL = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export function getSeasonMonths(season: Pick<Season, "start_date" | "end_date">): SeasonMonth[] {
  // Parse manual de YYYY-MM-DD: new Date("YYYY-MM-DD") é meia-noite UTC e, a oeste de UTC,
  // getMonth() devolvia o mês anterior (QUO-19)
  const [sy, sm] = season.start_date.split("-").map(Number);
  const [ey, em] = season.end_date.split("-").map(Number);
  const result: SeasonMonth[] = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m++) {
    if (m > 12) { m = 1; y++; if (y > ey) break; }
    if (y === ey && m > em) break;
    result.push({ month: m, year: y, label: `${MONTH_NAMES_PT[m - 1]} ${y}` });
  }
  return result;
}

export function monthLabel(month: number, year: number, full = false): string {
  const names = full ? MONTH_NAMES_FULL : MONTH_NAMES_PT;
  return `${names[month - 1]} ${year}`;
}

export function statusBadgeClass(status: PlayerPaymentStatus | null | undefined): string {
  switch (status) {
    case "paid":    return "bg-green-100 text-green-800 border-green-200";
    case "partial": return "bg-amber-100 text-amber-800 border-amber-200";
    case "late":    return "bg-red-100   text-red-800   border-red-200";
    case "exempt":  return "bg-slate-100 text-slate-600 border-slate-200";
    default:        return "bg-muted     text-muted-foreground border-transparent";
  }
}

export function statusLabel(status: PlayerPaymentStatus | null | undefined): string {
  switch (status) {
    case "paid":    return "Pago";
    case "partial": return "Parcial";
    case "late":    return "Em atraso";
    case "exempt":  return "Isento";
    default:        return "—";
  }
}

export function complianceBadgeClass(pct: number | null | undefined): string {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct >= 90)   return "bg-green-100 text-green-800";
  if (pct >= 60)   return "bg-amber-100 text-amber-800";
  return                  "bg-red-100   text-red-800";
}

export function formatCurrencyEUR(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

// ── Grid jogador × mês ────────────────────────────────────────────────────────

export const MONTH_NAMES_SHORT = [
  "Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez",
];

export type GridCellStatus = PlayerPaymentStatus | "unregistered" | "future";

export const CELL_COLORS: Record<GridCellStatus, { bg: string; text: string; border: string }> = {
  paid:         { bg: "#12855B", text: "#ffffff", border: "#0f6b49" },
  partial:      { bg: "#DC9A1C", text: "#ffffff", border: "#b87e17" },
  late:         { bg: "#D92D20", text: "#ffffff", border: "#b02418" },
  exempt:       { bg: "#98A2B3", text: "#ffffff", border: "#7a8699" },
  unregistered: { bg: "#FECDCA", text: "#D92D20", border: "#FDA29B" },
  future:       { bg: "#F2F4F7", text: "#98A2B3", border: "#e4e7ec" },
};

export const CELL_STATUS_LABELS: Record<GridCellStatus, string> = {
  paid:         "Pago",
  partial:      "Parcial",
  late:         "Em atraso",
  exempt:       "Isento",
  unregistered: "Por registar",
  future:       "Mês futuro",
};

export interface GridCell {
  key:        string;   // `${month}-${year}`
  month:      number;
  year:       number;
  status:     GridCellStatus;
  amountPaid: number;
  amountDue:  number;
  payment:    PlayerPaymentWithPlayer | null;
  isFuture:   boolean;
}

export function deriveCellState(
  month: number,
  year: number,
  payment: PlayerPaymentWithPlayer | null,
  today: Date,
  defaultAmountDue = 20,
): GridCell {
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const cellMonthStart = new Date(year, month - 1, 1);
  const isFuture       = cellMonthStart > thisMonthStart;
  const key            = `${month}-${year}`;

  if (payment) {
    return {
      key, month, year,
      status:     payment.status,
      amountPaid: Number(payment.amount),
      amountDue:  Number(payment.amount_due),
      payment,
      isFuture: false,
    };
  }
  if (isFuture) {
    return { key, month, year, status: "future",       amountPaid: 0, amountDue: 0,              payment: null, isFuture: true };
  }
  return   { key, month, year, status: "unregistered", amountPaid: 0, amountDue: defaultAmountDue, payment: null, isFuture: false };
}
