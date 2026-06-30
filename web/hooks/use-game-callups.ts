"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/ui/toaster";
import type { GameCallup } from "@/types/database";

export function useGameCallups(gameId: string | null) {
  const [callups, setCallups] = useState<GameCallup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!gameId) { setCallups([]); return; }
    setLoading(true);
    const res = await fetch(`/api/games/${gameId}/callups`);
    const json = await res.json();
    setCallups(json.callups ?? []);
    setLoading(false);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  async function addCallup(playerId: string): Promise<boolean> {
    if (!gameId) return false;
    const res = await fetch(`/api/games/${gameId}/callups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao convocar jogador", description: json.error, variant: "destructive" });
      return false;
    }
    setCallups((prev) => [...prev, json.callup]);
    return true;
  }

  async function removeCallup(callupId: string): Promise<boolean> {
    if (!gameId) return false;
    const res = await fetch(`/api/games/${gameId}/callups/${callupId}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: "Erro ao remover convocado", variant: "destructive" });
      return false;
    }
    setCallups((prev) => prev.filter((c) => c.id !== callupId));
    return true;
  }

  return { callups, loading, addCallup, removeCallup, refresh: load };
}
