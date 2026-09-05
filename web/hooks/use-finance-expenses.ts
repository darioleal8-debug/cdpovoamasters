"use client";

import { useState, useEffect, useCallback } from "react";
import type { FinancialExpense } from "@/types/database";
import { toast } from "@/components/ui/toaster";

interface Filters {
  season_id?: string | null;
  category?:  string;
  from?:      string;
  to?:        string;
}

export function useFinanceExpenses(filters: Filters = {}) {
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (filters.season_id) sp.set("season_id", filters.season_id);
    if (filters.category && filters.category !== "all") sp.set("category", filters.category);
    if (filters.from) sp.set("from", filters.from);
    if (filters.to)   sp.set("to",   filters.to);

    try {
      const res = await fetch(`/api/finance/expenses?${sp}`);
      const j   = await res.json();
      if (res.ok) setExpenses(j.expenses ?? []);
      else toast({ title: j.error ?? "Erro ao carregar despesas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters.season_id, filters.category, filters.from, filters.to]);

  useEffect(() => { load(); }, [load]);

  async function createExpense(data: Partial<FinancialExpense>): Promise<boolean> {
    const res = await fetch("/api/finance/expenses", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const j = await res.json();
    if (res.ok) {
      toast({ title: "Despesa registada" });
      load();
      return true;
    }
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  async function updateExpense(id: string, data: Partial<FinancialExpense>): Promise<boolean> {
    const res = await fetch(`/api/finance/expenses/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const j = await res.json();
    if (res.ok) {
      toast({ title: "Despesa atualizada" });
      load();
      return true;
    }
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  async function deleteExpense(id: string): Promise<boolean> {
    const res = await fetch(`/api/finance/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Despesa eliminada" });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      return true;
    }
    const j = await res.json();
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  return { expenses, loading, reload: load, createExpense, updateExpense, deleteExpense };
}
