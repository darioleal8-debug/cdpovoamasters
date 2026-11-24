"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { todayInClubTz } from "@/lib/time/club-time";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLAYER_PAYMENT_METHOD_LABELS, PLAYER_PAYMENT_STATUS_LABELS } from "@/types/database";
import type { RosterEntry } from "@/types/database";
import type { ChargeMethod, ChargeStatus, PaymentType, PlayerCharge } from "@/lib/payments/types";
import type { SaveChargeData } from "@/hooks/use-player-charges";

interface Props {
  open: boolean;
  onClose: () => void;
  type: PaymentType | null;
  seasonId: string | null;
  player: RosterEntry | null;
  existing: PlayerCharge | null;
  onSave: (data: SaveChargeData) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function ChargeModal({ open, onClose, type, seasonId, player, existing, onSave, onDelete }: Props) {
  const [amountDue, setAmountDue] = useState("0");
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState<ChargeStatus>("paid");
  const [method, setMethod] = useState<ChargeMethod | "">("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    const due = existing?.amount_due ?? type?.default_amount ?? 0;
    setAmountDue(String(due));
    setAmount(String(existing?.amount ?? due));
    setStatus(existing?.status ?? "paid");
    setMethod(existing?.method ?? "");
    setDate(existing?.payment_date ?? todayInClubTz(new Date()));
    setNotes(existing?.notes ?? "");
    setConfirmDel(false);
  }, [open, existing, type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!player || !type || !seasonId) return;
    setSaving(true);
    const ok = await onSave({
      season_id: seasonId,
      payment_type_id: type.id,
      player_id: player.player_id,
      user_id: player.player_id ? null : player.user_id,
      amount: parseFloat(amount) || 0,
      amount_due: parseFloat(amountDue) || 0,
      status,
      method: method || null,
      notes: notes.trim() || null,
      payment_date: date || null,
    });
    setSaving(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!existing) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setSaving(true);
    const ok = await onDelete(existing.id);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{type?.name ?? "Pagamento"} — {player?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ChargeStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(PLAYER_PAYMENT_STATUS_LABELS) as [ChargeStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status !== "exempt" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor pago (€)</Label>
                  <Input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor devido (€)</Label>
                  <Input type="number" min={0} step={0.01} value={amountDue} onChange={(e) => setAmountDue(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Data do pagamento</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={method || "none"} onValueChange={(v) => setMethod(v === "none" ? "" : (v as ChargeMethod))}>
                  <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(Object.entries(PLAYER_PAYMENT_METHOD_LABELS) as [ChargeMethod, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas opcionais..." />
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            {existing && (
              <Button type="button" variant="outline" disabled={saving} onClick={remove}
                className="mr-auto gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDel ? "Confirmar eliminação" : "Eliminar"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existing ? "Guardar alterações" : "Registar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
