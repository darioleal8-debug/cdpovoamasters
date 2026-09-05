"use client";

import { useState, useEffect, useCallback } from "react";
import type { FinanceDashboardData } from "@/types/database";

export function useFinanceDashboard(refreshKey = 0) {
  const [data,    setData]    = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/dashboard");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Erro ao carregar dashboard financeiro");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { data, loading, error, reload: load };
}
