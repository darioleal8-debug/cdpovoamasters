"use client";

import { useState, useEffect, useCallback } from "react";
import type { FinancialEntry } from "@/types/database";
import { toast } from "@/components/ui/toaster";

interface Filters {
  season_id?: string | null;
  category?:  string;
  from?:      string;
  to?:        string;
}

export function useFinanceEntries(filters: Filters = {}) {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (filters.season_id) sp.set("season_id", filters.season_id);
    if (filters.category && filters.category !== "all") sp.set("category", filters.category);
    if (filters.from) sp.set("from", filters.from);
    if (filters.to)   sp.set("to",   filters.to);

    try {
      const res = await fetch(`/api/finance/entries?${sp}`);
      const j   = await res.json();
      if (res.ok) setEntries(j.entries ?? []);
      else toast({ title: j.error ?? "Erro ao carregar entradas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters.season_id, filters.category, filters.from, filters.to]);

  useEffect(() => { load(); }, [load]);

  async function createEntry(data: Partial<FinancialEntry>): Promise<boolean> {
    const res = await fetch("/api/finance/entries", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const j = await res.json();
    if (res.ok) {
      toast({ title: "Entrada registada" });
      load();
      return true;
    }
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  async function updateEntry(id: string, data: Partial<FinancialEntry>): Promise<boolean> {
    const res = await fetch(`/api/finance/entries/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const j = await res.json();
    if (res.ok) {
      toast({ title: "Entrada atualizada" });
      load();
      return true;
    }
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  async function deleteEntry(id: string): Promise<boolean> {
    const res = await fetch(`/api/finance/entries/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Entrada eliminada" });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      return true;
    }
    const j = await res.json();
    toast({ title: "Erro", description: j.error, variant: "destructive" });
    return false;
  }

  async function syncCotas(season_id?: string | null): Promise<void> {
    const res = await fetch("/api/finance/entries/sync-cotas", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ season_id }),
    });
    const j = await res.json();
    if (res.ok) {
      toast({ title: `${j.synced} cotas sincronizadas` });
      load();
    } else {
      toast({ title: "Erro na sincronização", description: j.error, variant: "destructive" });
    }
  }

  return { entries, loading, reload: load, createEntry, updateEntry, deleteEntry, syncCotas };
}
