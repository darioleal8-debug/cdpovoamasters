"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { Event, GameFormData, TrainingFormData } from "@/types/database";

export function useGames(seasonId: string | null) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setEvents([]); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("season_id", seasonId)
      .order("event_date", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar eventos", variant: "destructive" });
    } else {
      setEvents(data ?? []);
    }
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function createGame(data: GameFormData): Promise<boolean> {
    const { error } = await supabase.from("events").insert({
      ...data,
      type: "jogo" as const,
    });
    if (error) {
      toast({ title: "Erro ao criar jogo", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Jogo criado com sucesso" });
    await load();
    return true;
  }

  async function createTraining(data: TrainingFormData): Promise<boolean> {
    const { error } = await supabase.from("events").insert({
      ...data,
      type: "treino" as const,
    });
    if (error) {
      toast({ title: "Erro ao criar treino", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Treino criado com sucesso" });
    await load();
    return true;
  }

  async function deleteEvent(id: string): Promise<boolean> {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover evento", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Evento removido" });
    await load();
    return true;
  }

  return { events, loading, createGame, createTraining, deleteEvent, refresh: load };
}
