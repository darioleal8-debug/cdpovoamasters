"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/ui/toaster";
import type { TeamKit } from "@/types/database";

export function useTeamKits() {
  const [kits,    setKits]    = useState<TeamKit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/team-kits");
    const json = await res.json();
    setKits(json.kits ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Index por nome (lowercase) para lookup rápido em jogos
  const kitsByTeam: Record<string, TeamKit> = {};
  for (const kit of kits) {
    kitsByTeam[kit.team_name.toLowerCase()] = kit;
  }

  async function saveKit(data: {
    id?: string;
    team_name: string;
    jersey_home_color: string;
    shorts_home_color: string;
    jersey_away_color: string;
    shorts_away_color: string;
    notes?: string | null;
  }): Promise<boolean> {
    if (data.id) {
      const { id, team_name: _tn, ...rest } = data;
      const res  = await fetch(`/api/team-kits/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(rest),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: "Erro ao guardar equipamento", description: json.error, variant: "destructive" }); return false; }
      toast({ title: "Equipamento atualizado" });
    } else {
      const res  = await fetch("/api/team-kits", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: "Erro ao criar equipamento", description: json.error, variant: "destructive" }); return false; }
      toast({ title: "Equipamento criado" });
    }
    await load();
    return true;
  }

  async function deleteKit(id: string): Promise<boolean> {
    const res = await fetch(`/api/team-kits/${id}`, { method: "DELETE" });
    if (!res.ok) { toast({ title: "Erro ao eliminar equipamento", variant: "destructive" }); return false; }
    toast({ title: "Equipamento eliminado" });
    await load();
    return true;
  }

  async function resetKit(id: string): Promise<boolean> {
    return saveKit({
      id,
      team_name:         kits.find((k) => k.id === id)?.team_name ?? "",
      jersey_home_color: "#1e3a8a",
      shorts_home_color: "#1e3a8a",
      jersey_away_color: "#ffffff",
      shorts_away_color: "#1e3a8a",
    });
  }

  return { kits, kitsByTeam, loading, saveKit, deleteKit, resetKit, refresh: load };
}
