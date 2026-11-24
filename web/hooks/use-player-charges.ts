"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toaster";
import type { ChargeMethod, ChargeStatus, PlayerCharge } from "@/lib/payments/types";

export interface SaveChargeData {
  season_id: string;
  payment_type_id: string;
  player_id?: string | null;
  user_id?: string | null;
  amount: number;
  amount_due: number;
  status: ChargeStatus;
  method: ChargeMethod | null;
  notes: string | null;
  payment_date: string | null;
}

/** Registos de um tipo de pagamento numa época. */
export function usePlayerCharges(seasonId: string | null, typeId: string | null) {
  const [charges, setCharges] = useState<PlayerCharge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seasonId || !typeId) { setCharges([]); setLoading(false); return; }
    setLoading(true);
    const res = await fetch(`/api/player-charges?season_id=${seasonId}&type_id=${typeId}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setCharges(res.ok ? (json.charges ?? []) : []);
    setLoading(false);
  }, [seasonId, typeId]);

  useEffect(() => { load(); }, [load]);

  async function saveCharge(data: SaveChargeData): Promise<boolean> {
    const res = await fetch("/api/player-charges", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast({ title: "Erro ao registar pagamento", description: json.error, variant: "destructive" }); return false; }
    toast({ title: "Pagamento registado" });
    await load();
    return true;
  }

  async function deleteCharge(id: string): Promise<boolean> {
    const res = await fetch(`/api/player-charges/${id}`, { method: "DELETE" });
    if (!res.ok) { toast({ title: "Erro ao eliminar registo", variant: "destructive" }); return false; }
    toast({ title: "Registo eliminado" });
    await load();
    return true;
  }

  return { charges, loading, saveCharge, deleteCharge, refresh: load };
}
