"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { PlayerWithUser, PlayerFormData } from "@/types/database";

export function usePlayers(seasonId: string | null) {
  const [players, setPlayers] = useState<PlayerWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setPlayers([]); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("player_profiles")
      .select("*, user:users(id, name, email, status)")
      .eq("season_id", seasonId)
      .order("jersey_number", { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: "Erro ao carregar jogadores", variant: "destructive" });
    } else {
      setPlayers((data ?? []) as unknown as PlayerWithUser[]);
    }
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function upsertPlayer(data: PlayerFormData): Promise<boolean> {
    const { error } = await supabase
      .from("player_profiles")
      .upsert(
        {
          user_id: data.user_id,
          season_id: data.season_id,
          jersey_number: data.jersey_number ?? null,
          position: data.position ?? null,
          height_cm: data.height_cm ?? null,
          age: data.age ?? null,
        },
        { onConflict: "user_id,season_id" }
      );

    if (error) {
      toast({ title: "Erro ao guardar jogador", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Jogador guardado com sucesso" });
    await load();
    return true;
  }

  async function deletePlayer(profileId: string): Promise<boolean> {
    const { error } = await supabase
      .from("player_profiles")
      .delete()
      .eq("id", profileId);

    if (error) {
      toast({ title: "Erro ao remover jogador", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Jogador removido" });
    await load();
    return true;
  }

  return { players, loading, upsertPlayer, deletePlayer, refresh: load };
}
