"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toaster";
import type { RosterEntry } from "@/types/database";

/** Jogadores do clube do utilizador para os Pagamentos (nunca de outros clubes, nem para o Master Admin). */
export function usePaymentPlayers(seasonId: string | null) {
  const [players, setPlayers] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seasonId) { setPlayers([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/players?season_id=${seasonId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar jogadores");
      setPlayers(json.players ?? []);
    } catch (e) {
      setPlayers([]);
      toast({ title: "Erro ao carregar jogadores", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  return { players, loading, refresh: load };
}
