"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RosterEntry, PlayerPaymentWithPlayer } from "@/types/database";
import type { GridCell } from "@/lib/payment-utils";
import { CELL_COLORS, CELL_STATUS_LABELS, formatCurrencyEUR } from "@/lib/payment-utils";
import { monthLabel } from "@/lib/payment-utils";
import type { UpsertPaymentData } from "@/hooks/use-player-payments";

export interface ActiveCellInfo {
  player:  RosterEntry;
  cell:    GridCell;
  anchor:  DOMRect;
}

interface Props {
  active:       ActiveCellInfo | null;
  seasonId:     string;
  onClose:      () => void;
  onQuickSave:  (data: UpsertPaymentData) => Promise<boolean>;
  onOpenEdit:   (player: RosterEntry, month: number, year: number) => void;
}

export function CellPopover({ active, seasonId, onClose, onQuickSave, onOpenEdit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState<string | null>(null); // "paid" | "exempt" | null

  // ── Close on outside click / Escape ───────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onClose]);

  if (!active) return null;

  const { player, cell, anchor } = active;
  const { status, amountPaid, amountDue, payment } = cell;
  const colors = CELL_COLORS[status];

  // ── Position: below the cell, clamp to viewport ───────────────────────────
  const POPOVER_W = 256;
  const POPOVER_H = 240;
  const margin    = 8;

  let top  = anchor.bottom + margin;
  let left = anchor.left;

  if (top + POPOVER_H + margin > window.innerHeight) top  = anchor.top - POPOVER_H - margin;
  if (left + POPOVER_W + margin > window.innerWidth)  left = window.innerWidth - POPOVER_W - margin;
  if (left < margin)                                   left = margin;

  async function quickSave(newStatus: "paid" | "exempt") {
    if (!seasonId) return;
    setSaving(newStatus);
    const today = new Date().toISOString().slice(0, 10);
    await onQuickSave({
      season_id:      seasonId,
      player_id:      player.player_id ?? undefined,
      user_id:        player.user_id,
      month:          cell.month,
      reference_year: cell.year,
      amount:         newStatus === "exempt" ? 0 : (payment?.amount_due ?? amountDue),
      amount_due:     newStatus === "exempt" ? 0 : (payment?.amount_due ?? amountDue),
      status:         newStatus,
      payment_date:   newStatus === "exempt" ? null : today,
    });
    setSaving(null);
    onClose();
  }

  const canMarkPaid   = status !== "paid"   && status !== "future"; // quick-pay desativado para futuros (amountDue=0)
  const canMarkExempt = status !== "exempt";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`Ações — ${player.name} · ${monthLabel(cell.month, cell.year)}`}
      style={{ position: "fixed", top, left, width: POPOVER_W, zIndex: 9999 }}
      className="rounded-xl border bg-popover shadow-xl text-popover-foreground flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b flex items-center gap-2">
        <span
          className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold"
          style={{ background: colors.bg, color: colors.text }}
        >
          {CELL_STATUS_LABELS[status]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{player.name}</p>
          <p className="text-[10px] text-muted-foreground">{monthLabel(cell.month, cell.year, true)}</p>
        </div>
      </div>

      {/* Amounts (if applicable) */}
      {status !== "future" && status !== "exempt" && (
        <div className="px-3 py-2 border-b grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Pago</p>
            <p className="font-bold tabular-nums">{amountPaid > 0 ? formatCurrencyEUR(amountPaid) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Devido</p>
            <p className="font-bold tabular-nums">{amountDue > 0 ? formatCurrencyEUR(amountDue) : "—"}</p>
          </div>
        </div>
      )}
      {payment?.payment_date && (
        <div className="px-3 py-1.5 border-b">
          <p className="text-[10px] text-muted-foreground">
            Pago em {new Date(payment.payment_date).toLocaleDateString("pt-PT")}
            {payment.method ? ` · ${payment.method}` : ""}
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-col gap-1 p-2">
        {canMarkPaid && (
          <Button
            size="sm"
            className="h-8 justify-start gap-2 text-xs bg-[#12855B] hover:bg-[#0f6b49] text-white border-0"
            disabled={!!saving}
            onClick={() => quickSave("paid")}
          >
            {saving === "paid"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <span>✓</span>}
            Marcar como pago
          </Button>
        )}
        {canMarkExempt && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 justify-start gap-2 text-xs"
            disabled={!!saving}
            onClick={() => quickSave("exempt")}
          >
            {saving === "exempt"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <span>⊘</span>}
            Marcar como isento
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 justify-start gap-2 text-xs"
          disabled={!!saving}
          onClick={() => { onClose(); onOpenEdit(player, cell.month, cell.year); }}
        >
          ↗ {payment ? "Editar detalhes" : "Registar pagamento"}
        </Button>
      </div>
    </div>
  );
}
