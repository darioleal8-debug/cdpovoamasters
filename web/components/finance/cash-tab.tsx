"use client";

import { useState } from "react";
import { useFinanceCash } from "@/hooks/use-finance-cash";
import { formatEUR, isoToDate } from "@/lib/finance-constants";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge }    from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, PiggyBank } from "lucide-react";
import type { FinancialCashMovement, CashMovementType } from "@/types/database";

const TYPE_LABELS: Record<CashMovementType, string> = {
  entrada:       "Entrada",
  saida:         "Saída",
  transferencia: "Transferência",
};

const TYPE_BADGE: Record<CashMovementType, string> = {
  entrada:       "border-green-600 text-green-700",
  saida:         "border-red-500 text-red-600",
  transferencia: "border-blue-500 text-blue-600",
};

const TYPE_ICON: Record<CashMovementType, React.ElementType> = {
  entrada:       ArrowDownCircle,
  saida:         ArrowUpCircle,
  transferencia: ArrowLeftRight,
};

interface CashFormData {
  type:          string;
  amount:        string;
  description:   string;
  movement_date: string;
  notes:         string;
}

const EMPTY: CashFormData = {
  type: "entrada", amount: "",
  description: "",
  movement_date: new Date().toISOString().split("T")[0],
  notes: "",
};

export function CashTab() {
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");
  const { movements, cashBalance, loading, addMovement, deleteMovement } =
    useFinanceCash(fromDate || undefined, toDate || undefined);

  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<CashFormData>(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [pendingDel,setPendingDel]= useState<FinancialCashMovement | null>(null);

  function openAdd() { setForm(EMPTY); setModalOpen(true); }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    const ok = await addMovement({
      type:          form.type as CashMovementType,
      amount:        parseFloat(form.amount),
      description:   form.description.trim(),
      movement_date: form.movement_date,
      notes:         form.notes.trim() || null,
    });
    setSaving(false);
    if (ok) setModalOpen(false);
  }

  return (
    <div className="space-y-4">
      {/* Saldo + toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-3">
          <PiggyBank className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-xs text-muted-foreground">Saldo em Caixa</p>
            <p className={`text-xl font-bold tabular-nums ${cashBalance >= 0 ? "text-green-600" : "text-red-500"}`}>
              {formatEUR(cashBalance)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
          <Input type="date" value={toDate}   onChange={(e) => setToDate(e.target.value)}   className="w-36" />
          <Button onClick={openAdd} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            Novo Movimento
          </Button>
        </div>
      </div>

      {/* Lista */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Data</th>
              <th className="px-4 py-3 text-left font-medium">Tipo</th>
              <th className="px-4 py-3 text-left font-medium">Descrição</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : movements.length === 0
              ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Sem movimentos de caixa.
                </td></tr>
              : movements.map((m) => {
                  const Icon = TYPE_ICON[m.type];
                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{isoToDate(m.movement_date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={TYPE_BADGE[m.type]}>
                          <Icon className="mr-1 h-3 w-3" />
                          {TYPE_LABELS[m.type]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.description}</p>
                        {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                        m.type === "entrada" ? "text-green-600" : m.type === "saida" ? "text-red-500" : "text-blue-600"
                      }`}>
                        {m.type === "entrada" ? "+" : m.type === "saida" ? "−" : ""}
                        {formatEUR(Number(m.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setPendingDel(m)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) setModalOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Movimento de Caixa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (€) *</Label>
              <Input required type="number" min="0.01" step="0.01" value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input required value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Ex.: Levantamento para fundo de maneio" />
            </div>
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input required type="date" value={form.movement_date}
                onChange={(e) => setForm((p) => ({ ...p, movement_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "A guardar..." : "Registar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDel} onOpenChange={(v) => { if (!v) setPendingDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar movimento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDel?.description}" será eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { await deleteMovement(pendingDel!.id); setPendingDel(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
