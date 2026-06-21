import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "d 'de' MMMM 'de' yyyy", { locale: pt });
}

export function formatDateShort(dateStr: string): string {
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: pt });
}

export function formatMonth(month: number): string {
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return months[month - 1] ?? String(month);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export const POSITION_LABELS: Record<string, string> = {
  base: "Base",
  extremo: "Extremo",
  poste: "Poste",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  treinador: "Treinador",
  jogador: "Jogador",
};

export const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  rejeitado: "Rejeitado",
  inativo: "Inativo",
  pago: "Pago",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  jogo: "Jogo",
  treino: "Treino",
  outro: "Outro",
};
