"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { DEFAULT_MONTHLY_FEE } from "@/lib/payment-utils";

/** Quota mensal do clube (€), editável a qualquer momento pelo administrador. */
export function useMonthlyFee() {
  const [fee, setFee] = useState<number>(DEFAULT_MONTHLY_FEE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/club-settings", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.monthly_fee != null) setFee(Number(json.monthly_fee));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveFee(value: number): Promise<boolean> {
    const res = await fetch("/api/club-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_fee: value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: "Não foi possível guardar a quota", description: json.error, variant: "destructive" });
      return false;
    }
    setFee(Number(json.monthly_fee ?? value));
    toast({ title: "Quota mensal atualizada" });
    return true;
  }

  return { fee, loading, saveFee };
}
