"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toaster";
import type { AvailabilityRosterRow } from "@/types/availability";

export function useGameAvailability(gameId: string | null) {
  const [availability, setAvailability] = useState<AvailabilityRosterRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!gameId) { setAvailability([]); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/games/${gameId}/availability`);
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Disponibilidade", description: json.error ?? "Erro ao carregar", variant: "destructive" });
        return;
      }
      setAvailability(json.players ?? []);
    } catch {
      // non-blocking — a convocatória não fica bloqueada se falhar
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  // Recarregar quando o utilizador volta ao separador
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const byPlayerId = useMemo(
    () => new Map(availability.map((a) => [a.player_id, a])),
    [availability]
  );

  const availableCount   = useMemo(() => availability.filter((a) => a.status === "available").length, [availability]);
  const unavailableCount = useMemo(() => availability.filter((a) => a.status === "unavailable").length, [availability]);
  const pendingCount     = useMemo(() => availability.filter((a) => !a.status).length, [availability]);

  return { availability, byPlayerId, loading, availableCount, unavailableCount, pendingCount, refresh: load };
}
