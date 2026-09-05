"use client";

import { useState } from "react";
import { useFinanceExpenses } from "@/hooks/use-finance-expenses";
import { useSeasons } from "@/hooks/use-seasons";
import {
  EXPENSE_CATEGORIES, getExpenseCategoryLabel, getExpenseCategoryColor,
  formatEUR, isoToDate,
} from "@/lib/finance-constants";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Pencil, Trash2, TrendingDown } from "lucide-react";
import type { FinancialExpense } from "@/types/database";

interface ExpenseFormData {
  description:  string;
  amount:       string;
  category:     string;
  expense_date: string;
  supplier:     string;
  notes:        string;
  season_id:    string;
}

const EMPTY: ExpenseFormData = {
  description: "", amount: "", category: "outro",
  expense_date: new Date().toISOString().split("T")[0],
  supplier: "", notes: "", season_id: "",
};

export function ExpensesTab() {
  const { seasons, activeSeason } = useSeasons();
  const [seasonId,  setSeasonId]  = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const [fromDate,  setFromDate]  = useState("");
  const [toDate,    setToDate]    = useState("");

  const sid = seasonId ?? activeSeason?.id ?? null;
  const { expenses, loading, createExpense, updateExpense, deleteExpense } =
    useFinanceExpenses({ season_id: sid, category: catFilter, from: fromDate, to: toDate });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<FinancialExpense | null>(null);
  const [form,      setForm]      = useState<ExpenseFormData>(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [pendingDel,setPendingDel]= useState<FinancialExpense | null>(null);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY, season_id: sid ?? "" });
    setModalOpen(true);
  }

  function openEdit(e: FinancialExpense) {
    setEditing(e);
    setForm({
      description:  e.description,
      amount:       String(e.amount),
      category:     e.category,
      expense_date: e.expense_date,
      supplier:     e.supplier ?? "",
      notes:        e.notes    ?? "",
      season_id:    e.season_id ?? "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    const payload = {
      description:  form.description.trim(),
      amount:       parseFloat(form.amount),
      category:     form.category,
      expense_date: form.expense_date,
      supplier:     form.supplier.trim() || null,
      notes:        form.notes.trim()    || null,
      season_id:    form.season_id       || null,
    };
    const ok = editing
      ? await updateExpense(editing.id, payload)
      : await createExpense(payload);
    setSaving(false);
    if (ok) setModalOpen(false);
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={sid ?? ""} onValueChange={setSeasonId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Temporada" /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
          <Input type="date" value={toDate}   onChange={(e) => setToDate(e.target.value)}   className="w-36" />
        </div>
        <Button onClick={openAdd} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Nova Despesa
        </Button>
      </div>

      {!loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingDown className="h-4 w-4 text-red-500" />
          <span>Total: <strong className="text-red-500">{formatEUR(total)}</strong> ({expenses.length} despesa(s))</span>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Data</th>
              <th className="px-4 py-3 text-left font-medium">Descrição</th>
              <th className="px-4 py-3 text-left font-medium">Categoria</th>
              <th className="px-4 py-3 text-left font-medium">Fornecedor</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : expenses.length === 0
              ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  Sem despesas registadas.
                </td></tr>
              : expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{isoToDate(e.expense_date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.description}</p>
                      {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getExpenseCategoryColor(e.category) }} />
                        {getExpenseCategoryLabel(e.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.supplier ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-500">
                      −{formatEUR(Number(e.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setPendingDel(e)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Modal despesa */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) setModalOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Despesa" : "Nova Despesa"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Descrição *</Label>
                <Input required value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Ex.: Pagamento árbitros" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (€) *</Label>
                <Input required type="number" min="0.01" step="0.01" value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input required type="date" value={form.expense_date}
                  onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Fornecedor</Label>
                <Input value={form.supplier}
                  onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                  placeholder="Nome do fornecedor (opcional)" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Observações</Label>
                <Input value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminação */}
      <AlertDialog open={!!pendingDel} onOpenChange={(v) => { if (!v) setPendingDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDel?.description}" será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { await deleteExpense(pendingDel!.id); setPendingDel(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
