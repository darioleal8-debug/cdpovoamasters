"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toaster";
import type { PaymentType } from "@/lib/payments/types";

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/** Tipos de pagamento do clube (além das quotas mensais). */
export function usePaymentTypes() {
  const [types, setTypes] = useState<PaymentType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, json } = await call("/api/payment-types", { cache: "no-store" });
    setTypes(ok ? (json.types ?? []) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addType(name: string, default_amount: number): Promise<boolean> {
    const { ok, json } = await call("/api/payment-types", { method: "POST", body: JSON.stringify({ name, default_amount }) });
    if (!ok) { toast({ title: "Não foi possível criar o tipo", description: json.error, variant: "destructive" }); return false; }
    toast({ title: "Tipo de pagamento criado" });
    await load();
    return true;
  }

  async function updateType(id: string, patch: { name?: string; default_amount?: number }): Promise<boolean> {
    const { ok, json } = await call(`/api/payment-types/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (!ok) { toast({ title: "Não foi possível guardar", description: json.error, variant: "destructive" }); return false; }
    await load();
    return true;
  }

  async function removeType(id: string): Promise<boolean> {
    const { ok, json } = await call(`/api/payment-types/${id}`, { method: "DELETE" });
    if (!ok) { toast({ title: "Não foi possível eliminar", description: json.error, variant: "destructive" }); return false; }
    toast({
      title: json.archived ? "Tipo arquivado" : "Tipo eliminado",
      description: json.archived ? "Tinha registos: deixa de aparecer, mas o histórico mantém-se." : undefined,
    });
    await load();
    return true;
  }

  return { types, loading, addType, updateType, removeType, refresh: load };
}
