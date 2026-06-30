"use client";

import { useMemo } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge }   from "@/components/ui/badge";
import { Button }  from "@/components/ui/button";
import type {
  Player, PlayerPaymentWithPlayer, PlayerPaymentSummary, Season,
} from "@/types/database";
import { MONTH_NAMES_PT } from "@/types/database";
import {
  getSeasonMonths, statusBadgeClass, statusLabel,
  complianceBadgeClass, formatCurrencyEUR,
} from "@/lib/payment-utils";

interface Props {
  open:     boolean;
  onClose:  () => void;
  player:   Player | null;
  payments: PlayerPaymentWithPlayer[];
  summary:  PlayerPaymentSummary | undefined;
  season:   Season | null;
  onEdit?:  (month: number, year: number) => void;
}

export function PlayerHistoryModal({ open, onClose, player, payments, summary, season, onEdit }: Props) {
  const seasonMonths = useMemo(() => (season ? getSeasonMonths(season) : []), [season]);

  if (!player) return null;

  const pct = summary?.compliance_pct != null ? Number(summary.compliance_pct) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {player.number && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cdpovoa-blue text-xs font-bold text-white">
                #{player.number}
              </span>
            )}
            <span>{player.name}</span>
            {pct != null && (
              <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${complianceBadgeClass(pct)}`}>
                {pct}%
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Resumo financeiro */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Pago"     value={formatCurrencyEUR(Number(summary.total_paid))}    color="green" />
            <StatCard label="Total Previsto" value={formatCurrencyEUR(Number(summary.total_due))}     color="blue"  />
            <StatCard label="Em Falta"       value={formatCurrencyEUR(Number(summary.total_missing))} color="red"   />
          </div>
        )}

        {/* Grelha de meses */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
          {seasonMonths.map(({ month, year, label }) => {
            const payment = payments.find(
              (p) => p.month === month && p.reference_year === year
            );
            const cls = statusBadgeClass(payment?.status);
            const lbl = statusLabel(payment?.status);

            const tooltipLines = payment ? [
              payment.status !== "exempt" && `${formatCurrencyEUR(Number(payment.amount))} / ${formatCurrencyEUR(Number(payment.amount_due))}`,
              payment.payment_date && `Pago em: ${new Date(payment.payment_date).toLocaleDateString("pt-PT")}`,
              payment.method && `Método: ${payment.method}`,
              payment.notes,
            ].filter(Boolean).join("\n") : undefined;

            return (
              <div
                key={`${month}-${year}`}
                title={tooltipLines}
                className={`group relative rounded-lg border p-3 transition-all ${cls} ${onEdit ? "cursor-pointer hover:shadow-md hover:scale-[1.02]" : "cursor-default select-none"}`}
                onClick={() => onEdit?.(month, year)}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {label}
                </p>
                <p className="mt-1 text-xs font-bold">{lbl}</p>
                {payment && payment.status !== "exempt" && (
                  <p className="mt-0.5 text-[11px] font-mono">
                    {formatCurrencyEUR(Number(payment.amount))}
                    {Number(payment.amount) < Number(payment.amount_due) && (
                      <span className="opacity-60">
                        {" "}/{formatCurrencyEUR(Number(payment.amount_due))}
                      </span>
                    )}
                  </p>
                )}
                {onEdit && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-gray-800 shadow">
                      <Pencil className="h-3 w-3" /> Editar
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap gap-2 pt-3 border-t">
          {([
            ["paid",    "Pago"],
            ["partial", "Parcial"],
            ["late",    "Em atraso"],
            ["exempt",  "Isento"],
          ] as const).map(([s, l]) => (
            <Badge key={s} variant="outline" className={`text-xs ${statusBadgeClass(s)}`}>{l}</Badge>
          ))}
          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">Não registado</Badge>
          {onEdit && (
            <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Clica em qualquer mês para editar
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: "green" | "blue" | "red" }) {
  const cls = {
    green: "border-t-green-500 text-green-700",
    blue:  "border-t-cdpovoa-blue text-cdpovoa-blue",
    red:   "border-t-red-500 text-red-700",
  }[color];

  return (
    <div className={`rounded-lg border border-t-4 p-3 ${cls}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold">{value}</p>
    </div>
  );
}

// Adicionar tipo para uso com MONTH_NAMES_PT
void MONTH_NAMES_PT;
