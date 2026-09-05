"use client";

import { useState, useEffect, useCallback } from "react";
import type { FinancialCashMovement } from "@/types/database";
import { toast } from "@/components/ui/toaster";

export function useFinanceCash(from?: string, to?: string) {
  const [movements, setMovements] = useState<FinancialCashMovement[]>([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to)   sp.set("to",   to);
    try {
      const res = await fetch(`/api/finance/cash?${sp}`);
      const j   = await res.json();
      if (res.ok) setMovements(j.movements ?? []);
      else toast({ title: j.error ?? "Erro ao carregar caixa", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const cashBalance = movements.reduce((s, m) => {
    const v = Number(m.amount);
    return m.type === "entrada" ? s + v : m.type === "saida" ? s - v : s;
  }, 0);

  async function addMovement(data: Partial<FinancialCashMovement>): Promise<boolean> {
    const res = await fetch("/api/finance/cash", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const j = await res.json();
    if (res.ok) {
      toast({ title: "Movimento de caixa registado" });
      load();
      return true;
    }
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  async function deleteMovement(id: string): Promise<boolean> {
    const res = await fetch(`/api/finance/cash?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Movimento eliminado" });
      setMovements((prev) => prev.filter((m) => m.id !== id));
      return true;
    }
    const j = await res.json();
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  return { movements, cashBalance, loading, reload: load, addMovement, deleteMovement };
}
