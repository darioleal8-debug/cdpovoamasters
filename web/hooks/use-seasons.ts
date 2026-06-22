"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { Season, SeasonFormData } from "@/types/database";

export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("seasons")
      .select("*")
      .order("start_date", { ascending: false });

    if (data) {
      setSeasons(data);
      setActiveSeason(data.find((s) => s.status === "ativa") ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createSeason(data: SeasonFormData): Promise<boolean> {
    const { error } = await supabase.from("seasons").insert({
      name: data.name,
      year: data.year,
      start_date: data.start_date,
      end_date: data.end_date,
      status: "arquivada",
    });

    if (error) {
      toast({ title: "Erro ao criar temporada", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Temporada criada com sucesso" });
    await load();
    return true;
  }

  async function updateSeason(id: string, data: Partial<SeasonFormData>): Promise<boolean> {
    const { error } = await supabase
      .from("seasons")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao atualizar temporada", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Temporada atualizada com sucesso" });
    await load();
    return true;
  }

  async function activateSeason(id: string): Promise<boolean> {
    // Arquiva todas as temporadas ativas primeiro (evita violação do índice único)
    const { error: e1 } = await supabase
      .from("seasons")
      .update({ status: "arquivada" })
      .eq("status", "ativa");

    if (e1) {
      toast({ title: "Erro ao ativar temporada", description: e1.message, variant: "destructive" });
      return false;
    }

    // Ativa a temporada pretendida
    const { error: e2 } = await supabase
      .from("seasons")
      .update({ status: "ativa" })
      .eq("id", id);

    if (e2) {
      toast({ title: "Erro ao ativar temporada", description: e2.message, variant: "destructive" });
      return false;
    }

    toast({ title: "Temporada ativada com sucesso" });
    await load();
    return true;
  }

  async function deleteSeason(id: string): Promise<boolean> {
    const season = seasons.find((s) => s.id === id);
    if (season?.status === "ativa") {
      toast({ title: "Não é possível eliminar a temporada ativa", variant: "destructive" });
      return false;
    }

    const { error } = await supabase.from("seasons").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao eliminar temporada", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Temporada eliminada" });
    await load();
    return true;
  }

  return {
    seasons,
    activeSeason,
    loading,
    refresh: load,
    createSeason,
    updateSeason,
    activateSeason,
    deleteSeason,
  };
}
