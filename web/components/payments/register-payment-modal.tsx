"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  Player, PlayerPayment, PlayerPaymentStatus, PlayerPaymentMethod, Season,
} from "@/types/database";
import {
  PLAYER_PAYMENT_STATUS_LABELS, PLAYER_PAYMENT_METHOD_LABELS, MONTH_NAMES_PT,
} from "@/types/database";
import { getSeasonMonths, statusBadgeClass } from "@/lib/payment-utils";

export interface SavePaymentData {
  player_id:      string;
  month:          number;
  reference_year: number;
  amount:         number;
  amount_due:     number;
  status:         PlayerPaymentStatus;
  method:         PlayerPaymentMethod | null;
  notes:          string | null;
  payment_date:   string | null;
}

interface Props {
  open:       boolean;
  onClose:    () => void;
  onSave:     (data: SavePaymentData) => Promise<boolean>;
  onDelete?:  () => Promise<boolean>;
  players:    Player[];
  season:     Season | null;
  prefill?: {
    playerId?:        string;
    month?:           number;
    year?:            number;
    existingPayment?: PlayerPayment;
  };
}

const STATUS_COLORS: Record<PlayerPaymentStatus, string> = {
  paid:    "text-green-700",
  partial: "text-amber-700",
  late:    "text-red-700",
  exempt:  "text-slate-600",
};

export function RegisterPaymentModal({ open, onClose, onSave, onDelete, players, season, prefill }: Props) {
  const seasonMonths = season ? getSeasonMonths(season) : [];
  const today        = new Date();
  const existing     = prefill?.existingPayment;
  const isEditing    = !!existing;

  function computeDefaultMonthKey() {
    if (prefill?.month && prefill?.year) return `${prefill.month}-${prefill.year}`;
    const inSeason = seasonMonths.find(
      (m) => m.month === today.getMonth() + 1 && m.year === today.getFullYear()
    );
    if (inSeason) return `${inSeason.month}-${inSeason.year}`;
    const last = seasonMonths.at(-1);
    return last ? `${last.month}-${last.year}` : "";
  }

  const [playerId,    setPlayerId]    = useState(prefill?.playerId ?? "");
  const [monthKey,    setMonthKey]    = useState(computeDefaultMonthKey());
  const [amount,      setAmount]      = useState(existing?.amount?.toString() ?? "20");
  const [amountDue,   setAmountDue]   = useState(existing?.amount_due?.toString() ?? "20");
  const [status,      setStatus]      = useState<PlayerPaymentStatus>(existing?.status ?? "paid");
  const [method,      setMethod]      = useState<PlayerPaymentMethod | "">(existing?.method ?? "");
  const [notes,       setNotes]       = useState(existing?.notes ?? "");
  const [paymentDate, setPaymentDate] = useState(existing?.payment_date ?? today.toISOString().slice(0, 10));
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (!open) { setConfirmDel(false); return; }
    const ex = prefill?.existingPayment;
    setPlayerId(prefill?.playerId ?? "");
    setMonthKey(computeDefaultMonthKey());
    setAmount(ex?.amount?.toString()     ?? "20");
    setAmountDue(ex?.amount_due?.toString() ?? "20");
    setStatus(ex?.status ?? "paid");
    setMethod(ex?.method ?? "");
    setNotes(ex?.notes   ?? "");
    setPaymentDate(ex?.payment_date ?? today.toISOString().slice(0, 10));
    setConfirmDel(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Isenção zera valores
  useEffect(() => {
    if (status === "exempt") { setAmount("0"); setAmountDue("0"); }
  }, [status]);

  const [selMonth, selYear] = monthKey.split("-").map(Number);
  const playerFixed = !!prefill?.playerId;
  const monthFixed  = !!(prefill?.month && prefill?.year);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !monthKey) return;
    setSaving(true);
    const ok = await onSave({
      player_id:      playerId,
      month:          selMonth,
      reference_year: selYear,
      amount:         parseFloat(amount)    || 0,
      amount_due:     parseFloat(amountDue) || 20,
      status,
      method:       (method as PlayerPaymentMethod) || null,
      notes:        notes.trim() || null,
      payment_date: paymentDate || null,
    });
    setSaving(false);
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (!onDelete) return;
    setDeleting(true);
    const ok = await onDelete();
    setDeleting(false);
    if (ok) onClose();
  }

  const statusCls = statusBadgeClass(isEditing ? existing?.status : undefined);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirmDel(false); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing
              ? <><Pencil className="h-4 w-4 text-amber-600" /> Editar Pagamento</>
              : <><Plus   className="h-4 w-4 text-green-600" /> Registar Pagamento</>
            }
          </DialogTitle>
          {isEditing && (
            <div className={`mt-1 inline-flex self-start items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCls}`}>
              {PLAYER_PAYMENT_STATUS_LABELS[existing!.status]}
              {" "}— {MONTH_NAMES_PT[(existing!.month ?? 1) - 1]} {existing!.reference_year}
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Jogador */}
          <div className="space-y-1.5">
            <Label>Jogador *</Label>
            {playerFixed ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
                {players.find((p) => p.id === playerId)?.name ?? playerId}
              </p>
            ) : (
              <Select value={playerId} onValueChange={setPlayerId} required>
                <SelectTrigger><SelectValue placeholder="Selecionar jogador" /></SelectTrigger>
                <SelectContent>
                  {players
                    .slice()
                    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.number ? `#${p.number} ` : ""}{p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Mês */}
          <div className="space-y-1.5">
            <Label>Mês *</Label>
            {monthFixed ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
                {MONTH_NAMES_PT[(selMonth ?? 1) - 1]} {selYear}
              </p>
            ) : (
              <Select value={monthKey} onValueChange={setMonthKey} required>
                <SelectTrigger><SelectValue placeholder="Selecionar mês" /></SelectTrigger>
                <SelectContent>
                  {seasonMonths.map((m) => (
                    <SelectItem key={`${m.month}-${m.year}`} value={`${m.month}-${m.year}`}>
                      {MONTH_NAMES_PT[m.month - 1]} {m.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Estado */}
          <div className="space-y-1.5">
            <Label>Estado *</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PlayerPaymentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PLAYER_PAYMENT_STATUS_LABELS) as [PlayerPaymentStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className={STATUS_COLORS[k]}>{v}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valores */}
          {status !== "exempt" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor Pago (€)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quota Mensal (€)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={amountDue}
                  onChange={(e) => setAmountDue(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Data */}
          {status !== "exempt" && (
            <div className="space-y-1.5">
              <Label>Data do Pagamento</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          )}

          {/* Método */}
          {status !== "exempt" && (
            <div className="space-y-1.5">
              <Label>Método de Pagamento</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PlayerPaymentMethod)}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(Object.entries(PLAYER_PAYMENT_METHOD_LABELS) as [PlayerPaymentMethod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionais..."
              rows={2}
            />
          </div>

          {/* Confirmação de eliminação */}
          {confirmDel && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                Confirmar eliminação? Esta ação não pode ser desfeita.
                Clica em &quot;Eliminar&quot; novamente para confirmar.
              </p>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            {/* Botão eliminar (apenas ao editar) */}
            {isEditing && onDelete && (
              <Button
                type="button"
                variant="outline"
                className={`mr-auto gap-1.5 ${confirmDel ? "border-red-500 text-red-600 hover:bg-red-50" : "text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50"}`}
                disabled={deleting || saving}
                onClick={handleDelete}
              >
                {deleting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2  className="h-3.5 w-3.5" />
                }
                {confirmDel ? "Confirmar eliminação" : "Eliminar"}
              </Button>
            )}

            <Button type="button" variant="outline" onClick={onClose} disabled={saving || deleting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || deleting || !playerId || !monthKey}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Guardar Alterações" : "Registar Pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
