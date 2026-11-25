"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import type { PendingConfirmation } from "@/lib/trainings/pending-confirmations";

function label(p: PendingConfirmation): string {
  const day = new Date(`${p.date}T12:00:00`).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function when(p: PendingConfirmation): string {
  const start = p.start_time?.slice(0, 5);
  const end = p.end_time?.slice(0, 5);
  const hours = start ? (end ? `${start}–${end}` : start) : null;
  return [hours, p.location].filter(Boolean).join(" · ");
}

/**
 * Notificações do dashboard: "Foste ao treino?" para cada treino terminado a que o jogador disse que ia.
 * Acumulam (uma por treino) e só desaparecem quando respondidas. Não mostra nada se não houver pendentes.
 */
export function PendingPresenceConfirmations() {
  const [items, setItems] = useState<PendingConfirmation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/training-confirmations", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { pending?: PendingConfirmation[] };
      setItems(json.pending ?? []);
    } catch { /* não-fatal: sem notificações */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function answer(p: PendingConfirmation, attended: boolean) {
    setBusy(p.training_id);
    try {
      const res = await fetch("/api/training-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_id: p.training_id, attended }),
      });
      // 409 = já registada entretanto: a notificação deixa de fazer sentido, sai também
      if (res.ok || res.status === 409) {
        setItems((cur) => cur.filter((i) => i.training_id !== p.training_id));
        if (res.ok) toast({ title: attended ? "Presença confirmada" : "Falta registada" });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast({ title: json.error ?? "Não foi possível guardar a resposta.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section aria-label="Confirmar presença nos treinos" className="flex flex-col gap-2">
      {items.map((p) => (
        <div
          key={p.training_id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          <div className="flex min-w-0 items-start gap-3">
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Foste ao treino de {label(p)}?</p>
              {when(p) && <p className="truncate text-xs text-muted-foreground">{when(p)}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy === p.training_id} onClick={() => answer(p, true)}>
              {busy === p.training_id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Fui
            </Button>
            <Button size="sm" variant="outline" disabled={busy === p.training_id} onClick={() => answer(p, false)}>
              <X className="mr-1 h-4 w-4" />Não fui
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
