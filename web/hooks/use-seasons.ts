"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { myClubId } from "@/lib/club/my-club-id";
import { toast } from "@/components/ui/toaster";
import type { Season, SeasonFormData } from "@/types/database";

export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    // Só as temporadas do clube do utilizador (o Master Admin vê as de todos os clubes por RLS)
    const clubId = await myClubId(supabase);
    let query = supabase.from("seasons").select("*").order("start_date", { ascending: false });
    if (clubId) query = query.eq("club_id", clubId);
    const { data } = await query;

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
      // A primeira temporada do clube (ou se não houver nenhuma ativa) fica logo ativa;
      // senão o clube novo fica sem temporada selecionada e sem perceber porquê.
      status: activeSeason ? "arquivada" : "ativa",
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
    // Arquiva as temporadas ativas DO CLUBE primeiro (evita violação do índice único).
    // Sem filtro de clube, o Master Admin arquivava também as temporadas ativas dos outros clubes.
    const clubId = await myClubId(supabase);
    if (!clubId) {
      toast({ title: "Erro ao ativar temporada", description: "Clube não identificado.", variant: "destructive" });
      return false;
    }
    const { error: e1 } = await supabase
      .from("seasons")
      .update({ status: "arquivada" })
      .eq("club_id", clubId)
      .eq("status", "ativa");

    if (e1) {
      toast({ title: "Erro ao ativar temporada", description: e1.message, variant: "destructive" });
      return false;
    }

    // Ativa a temporada pretendida
    const { error: e2 } = await supabase
      .from("seasons")
      .update({ status: "ativa" })
      .eq("id", id)
      .eq("club_id", clubId);

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
