"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrencyEUR } from "@/lib/payment-utils";

interface Props {
  fee: number;
  /** Só administradores podem alterar o valor. */
  canEdit: boolean;
  onSave: (value: number) => Promise<boolean>;
}

/** Mostra a quota mensal do clube e deixa o administrador alterá-la a qualquer momento. */
export function MonthlyFeeEditor({ fee, canEdit, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(fee));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    setSaving(true);
    const ok = await onSave(n);
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
      <span className="text-muted-foreground">Quota mensal</span>
      {!editing ? (
        <>
          <span className="font-bold tabular-nums">{formatCurrencyEUR(fee)}/mês</span>
          {canEdit && (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1"
              onClick={() => { setValue(String(fee)); setEditing(true); }}>
              <Pencil className="h-3 w-3" />Editar
            </Button>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-1.5">
          <Input type="number" inputMode="decimal" min={0} max={1000} step={0.01} autoFocus
            value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-24"
            aria-label="Quota mensal (€)" />
          <span className="text-muted-foreground">€/mês</span>
          <Button type="submit" size="sm" className="h-8 gap-1" disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Guardar
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" disabled={saving} onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </form>
      )}
      <span className="w-full text-[11px] text-muted-foreground">
        A alteração aplica-se aos meses ainda sem registo; os pagamentos já registados mantêm o seu valor.
      </span>
    </div>
  );
}
