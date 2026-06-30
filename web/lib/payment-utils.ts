import type { Season, PlayerPaymentStatus } from "@/types/database";

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

export function getSeasonMonths(season: Season): SeasonMonth[] {
  const start = new Date(season.start_date);
  const end   = new Date(season.end_date);
  const result: SeasonMonth[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    result.push({
      month: cur.getMonth() + 1,
      year:  cur.getFullYear(),
      label: `${MONTH_NAMES_PT[cur.getMonth()]} ${cur.getFullYear()}`,
    });
    cur.setMonth(cur.getMonth() + 1);
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
