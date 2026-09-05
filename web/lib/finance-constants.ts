export const INCOME_CATEGORIES = [
  { value: "cota",          label: "Cota",          color: "#22c55e" },
  { value: "patrocinio",    label: "Patrocínio",    color: "#3b82f6" },
  { value: "donativo",      label: "Donativo",      color: "#8b5cf6" },
  { value: "bilheteira",    label: "Bilheteira",    color: "#f59e0b" },
  { value: "merchandising", label: "Merchandising", color: "#ec4899" },
  { value: "outro",         label: "Outro",         color: "#6b7280" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "equipamentos",  label: "Equipamentos",  color: "#ef4444" },
  { value: "deslocacoes",   label: "Deslocações",   color: "#f97316" },
  { value: "taxas",         label: "Taxas",         color: "#eab308" },
  { value: "arbitros",      label: "Árbitros",      color: "#84cc16" },
  { value: "aluguer",       label: "Aluguer",       color: "#06b6d4" },
  { value: "comunicacao",   label: "Comunicação",   color: "#6366f1" },
  { value: "outro",         label: "Outro",         color: "#6b7280" },
] as const;

export function getIncomeCategoryLabel(value: string): string {
  return INCOME_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
export function getExpenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
export function getIncomeCategoryColor(value: string): string {
  return INCOME_CATEGORIES.find((c) => c.value === value)?.color ?? "#6b7280";
}
export function getExpenseCategoryColor(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.color ?? "#6b7280";
}

export const FINANCE_ROLES = ["admin", "tesoureiro"] as const;
export type FinanceRole = typeof FINANCE_ROLES[number];

export function formatEUR(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

export function isoToDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
