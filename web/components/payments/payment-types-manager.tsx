"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_TYPE_NAME_MAX, type PaymentType } from "@/lib/payments/types";

interface Props {
  open: boolean;
  onClose: () => void;
  types: PaymentType[];
  onAdd: (name: string, amount: number) => Promise<boolean>;
  onUpdate: (id: string, patch: { name?: string; default_amount?: number }) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

function Row({ type, onUpdate, onRemove }: { type: PaymentType } & Pick<Props, "onUpdate" | "onRemove">) {
  const [name, setName] = useState(type.name);
  const [amount, setAmount] = useState(String(type.default_amount));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function commit() {
    const patch: { name?: string; default_amount?: number } = {};
    if (name.trim() && name.trim() !== type.name) patch.name = name.trim();
    const n = parseFloat(amount);
    if (!Number.isNaN(n) && n !== type.default_amount) patch.default_amount = n;
    if (!Object.keys(patch).length) { setName(type.name); setAmount(String(type.default_amount)); return; }
    setBusy(true);
    const ok = await onUpdate(type.id, patch);
    if (!ok) { setName(type.name); setAmount(String(type.default_amount)); }
    setBusy(false);
  }

  async function remove() {
    if (!confirm) { setConfirm(true); return; }
    setBusy(true);
    await onRemove(type.id);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Input value={name} maxLength={PAYMENT_TYPE_NAME_MAX} onChange={(e) => setName(e.target.value)} onBlur={commit} className="h-9 flex-1" aria-label="Nome do tipo" />
      <Input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={commit} className="h-9 w-24" aria-label="Valor por defeito (€)" />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={remove}
        className={`h-9 gap-1 ${confirm ? "border-red-500 text-red-600" : "text-red-600"}`} title="Eliminar tipo">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {confirm && "Confirmar"}
      </Button>
    </div>
  );
}

/** O clube acrescenta, renomeia e elimina os tipos de pagamento que quer controlar. */
export function PaymentTypesManager({ open, onClose, types, onAdd, onUpdate, onRemove }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    const ok = await onAdd(name.trim(), parseFloat(amount) || 0);
    setAdding(false);
    if (ok) { setName(""); setAmount(""); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tipos de pagamento</DialogTitle>
          <DialogDescription>
            Além das quotas mensais, o clube controla aqui o que cobra uma vez por época (inscrição, equipamento, seguro…).
            O valor é o sugerido ao registar. Eliminar um tipo com registos arquiva-o e mantém o histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {types.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há tipos de pagamento.</p>}
          {types.length > 0 && (
            <div className="flex gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">Nome</span><span className="w-24">Valor (€)</span><span className="w-10" />
            </div>
          )}
          {types.map((t) => <Row key={`${t.id}-${t.name}-${t.default_amount}`} type={t} onUpdate={onUpdate} onRemove={onRemove} />)}
        </div>

        <form onSubmit={add} className="mt-2 flex items-end gap-2 border-t pt-3">
          <div className="flex-1 space-y-1.5">
            <Label>Novo tipo</Label>
            <Input value={name} maxLength={PAYMENT_TYPE_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Equipamento" className="h-9" />
          </div>
          <div className="w-24 space-y-1.5">
            <Label>Valor (€)</Label>
            <Input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-9" />
          </div>
          <Button type="submit" disabled={adding || !name.trim()} className="h-9 gap-1">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
