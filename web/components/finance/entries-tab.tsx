"use client";

import { useState } from "react";
import { useFinanceEntries } from "@/hooks/use-finance-entries";
import { useSeasons } from "@/hooks/use-seasons";
import {
  INCOME_CATEGORIES, getIncomeCategoryLabel, getIncomeCategoryColor,
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
import { Plus, Pencil, Trash2, RefreshCw, TrendingUp } from "lucide-react";
import type { FinancialEntry } from "@/types/database";

function CategoryDot({ value }: { value: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
      style={{ backgroundColor: getIncomeCategoryColor(value) }}
    />
  );
}

interface EntryFormData {
  description: string;
  amount:      string;
  category:    string;
  entry_date:  string;
  player_name: string;
  notes:       string;
  season_id:   string;
}

const EMPTY: EntryFormData = {
  description: "", amount: "", category: "outro",
  entry_date: new Date().toISOString().split("T")[0],
  player_name: "", notes: "", season_id: "",
};

export function EntriesTab() {
  const { seasons, activeSeason } = useSeasons();
  const [seasonId,  setSeasonId]  = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const [fromDate,  setFromDate]  = useState("");
  const [toDate,    setToDate]    = useState("");

  const sid = seasonId ?? activeSeason?.id ?? null;
  const { entries, loading, createEntry, updateEntry, deleteEntry, syncCotas } =
    useFinanceEntries({ season_id: sid, category: catFilter, from: fromDate, to: toDate });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<FinancialEntry | null>(null);
  const [form,      setForm]      = useState<EntryFormData>(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [pendingDel,setPendingDel]= useState<FinancialEntry | null>(null);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY, season_id: sid ?? "" });
    setModalOpen(true);
  }

  function openEdit(e: FinancialEntry) {
    setEditing(e);
    setForm({
      description: e.description,
      amount:      String(e.amount),
      category:    e.category,
      entry_date:  e.entry_date,
      player_name: e.player_name ?? "",
      notes:       e.notes ?? "",
      season_id:   e.season_id ?? "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    const payload = {
      description: form.description.trim(),
      amount:      parseFloat(form.amount),
      category:    form.category,
      entry_date:  form.entry_date,
      player_name: form.player_name.trim() || null,
      notes:       form.notes.trim() || null,
      season_id:   form.season_id || null,
    };
    const ok = editing
      ? await updateEntry(editing.id, payload)
      : await createEntry(payload);
    setSaving(false);
    if (ok) setModalOpen(false);
  }

  async function handleSync() {
    setSyncing(true);
    await syncCotas(sid);
    setSyncing(false);
  }

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

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
            <SelectTrigger className="w-36"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {INCOME_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
          <Input type="date" value={toDate}   onChange={(e) => setToDate(e.target.value)}   className="w-36" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar Cotas
          </Button>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nova Entrada
          </Button>
        </div>
      </div>

      {/* Total */}
      {!loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <span>Total: <strong className="text-green-600">{formatEUR(total)}</strong> ({entries.length} entrada(s))</span>
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
              <th className="px-4 py-3 text-left font-medium">Origem</th>
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
              : entries.length === 0
              ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  Sem entradas registadas.
                </td></tr>
              : entries.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{isoToDate(e.entry_date)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.description}</p>
                      {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <CategoryDot value={e.category} />
                        {getIncomeCategoryLabel(e.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {e.source_type === "cota_jogador"
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-[10px] font-medium">Cota auto</span>
                        : e.player_name ?? "Manual"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      +{formatEUR(Number(e.amount))}
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

      {/* Modal entrada */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) setModalOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Entrada" : "Nova Entrada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Descrição *</Label>
                <Input required value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Ex.: Cota Janeiro — João Silva" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (€) *</Label>
                <Input required type="number" min="0.01" step="0.01" value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="20.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input required type="date" value={form.entry_date}
                  onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCOME_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Origem / Jogador</Label>
                <Input value={form.player_name}
                  onChange={(e) => setForm((p) => ({ ...p, player_name: e.target.value }))}
                  placeholder="Nome do jogador ou origem" />
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
            <AlertDialogTitle>Eliminar entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDel?.description}" será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { await deleteEntry(pendingDel!.id); setPendingDel(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
