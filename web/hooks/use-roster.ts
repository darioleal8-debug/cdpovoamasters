"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { Player, PlayerPosition } from "@/types/database";

export interface UpdatePlayerData {
  number?:   number | null;
  position?: PlayerPosition | null;
  height?:   number | null;
  weight?:   number | null;
  age?:      number | null;
}

export function useRoster(seasonId: string | null) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setPlayers([]); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("season_id", seasonId)
      .order("number", { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: "Erro ao carregar jogadores", description: error.message, variant: "destructive" });
    } else {
      setPlayers((data ?? []) as Player[]);
    }
    setLoading(false);
  }, [seasonId, supabase]);

  useEffect(() => { load(); }, [load]);

  // Criar jogador — vai ao API route (que usa service role para Storage)
  async function createPlayer(fd: FormData): Promise<boolean> {
    try {
      const res = await fetch("/api/players", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast({
          title: "Erro ao criar jogador",
          description: data.error ?? "Erro desconhecido",
          variant: "destructive",
        });
        return false;
      }

      toast({ title: "Jogador criado com sucesso!" });
      await load();
      return true;
    } catch (e) {
      toast({ title: "Erro de rede", description: (e as Error).message, variant: "destructive" });
      return false;
    }
  }

  // Editar campos de texto/número diretamente (sem ficheiro)
  async function updatePlayer(playerId: string, data: UpdatePlayerData): Promise<boolean> {
    const { error } = await supabase
      .from("players")
      .update({
        number:   data.number   ?? null,
        position: data.position ?? null,
        height:   data.height   ?? null,
        weight:   data.weight   ?? null,
        age:      data.age      ?? null,
      })
      .eq("id", playerId);

    if (error) {
      toast({ title: "Erro ao guardar jogador", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Jogador guardado com sucesso" });
    await load();
    return true;
  }

  // Atualizar foto — vai ao API route (service role para Storage)
  async function updatePlayerPhoto(playerId: string, photo: File): Promise<boolean> {
    try {
      const fd = new FormData();
      fd.append("player_id", playerId);
      fd.append("photo", photo);

      const res = await fetch("/api/players", { method: "PATCH", body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast({
          title: "Erro ao atualizar foto",
          description: data.error ?? "Erro desconhecido",
          variant: "destructive",
        });
        return false;
      }

      await load();
      return true;
    } catch (e) {
      toast({ title: "Erro de rede", description: (e as Error).message, variant: "destructive" });
      return false;
    }
  }

  // Remover jogador
  async function deletePlayer(playerId: string, playerName: string): Promise<boolean> {
    if (!confirm(`Remover ${playerName} do plantel?`)) return false;

    const { error } = await supabase
      .from("players")
      .delete()
      .eq("id", playerId);

    if (error) {
      toast({ title: "Erro ao remover jogador", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Jogador removido" });
    await load();
    return true;
  }

  return { players, loading, createPlayer, updatePlayer, updatePlayerPhoto, deletePlayer, refresh: load };
}
