"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { RosterEntry, PlayerPosition } from "@/types/database";

export interface UpdatePlayerData {
  number?:   number | null;
  position?: PlayerPosition | null;
  height?:   number | null;
  weight?:   number | null;
  age?:      number | null;
}

// Devolve todos os utilizadores com role=jogador (ou jogador em roles_extra),
// com os dados do perfil desportivo desta época quando existirem.
// Utiliza duas queries + merge em JS para incluir jogadores sem perfil ainda criado.
export function useRoster(seasonId: string | null) {
  const [players, setPlayers] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setPlayers([]); setLoading(false); return; }
    setLoading(true);

    // 1. Todos os utilizadores com função de jogador (primária ou secundária)
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, name, email, phone, active, roles_extra, created_at")
      .or('role.eq.jogador,roles_extra.cs.["jogador"]');

    // 2. Perfis desportivos desta época
    const { data: profiles, error: profilesError } = await supabase
      .from("players")
      .select("id, user_id, season_id, number, position, height, weight, age, birth_date, photo_url, original_photo_url, processed_photo_url, photo_focal_x, photo_focal_y, photo_template_version, team_id, created_at")
      .eq("season_id", seasonId);

    if (usersError || profilesError) {
      toast({
        title: "Erro ao carregar plantel",
        description: (usersError ?? profilesError)!.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // 3. Merge: um registo por utilizador; dados desportivos quando existem
    const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));

    const roster: RosterEntry[] = (users ?? []).map((u) => {
      const p = profileByUserId.get(u.id as string);
      return {
        id:          u.id as string,
        user_id:     u.id as string,
        player_id:   p ? (p.id as string) : null,
        season_id:   p ? (p.season_id as string) : null,
        name:        u.name as string,
        email:       u.email as string,
        phone:       (u.phone as string | null) ?? null,
        active:      u.active as boolean,
        roles_extra: ((u.roles_extra as string[]) ?? []) as import("@/types/database").UserRole[],
        number:      (p?.number as number | null) ?? null,
        position:    (p?.position as PlayerPosition | null) ?? null,
        height:      (p?.height as number | null) ?? null,
        weight:      (p?.weight as number | null) ?? null,
        age:         (p?.age as number | null) ?? null,
        birth_date:  (p?.birth_date as string | null) ?? null,
        photo_url:              (p?.photo_url as string | null) ?? null,
        original_photo_url:     (p?.original_photo_url as string | null) ?? null,
        processed_photo_url:    (p?.processed_photo_url as string | null) ?? null,
        photo_focal_x:          (p?.photo_focal_x as number | null) ?? null,
        photo_focal_y:          (p?.photo_focal_y as number | null) ?? null,
        photo_template_version: (p?.photo_template_version as number | null) ?? null,
        team_id:                (p?.team_id as string | null) ?? null,
        created_at:  (p?.created_at ?? u.created_at) as string,
      };
    });

    // Ordenar: com número primeiro (crescente), depois por nome
    roster.sort((a, b) => {
      if (a.number !== null && b.number !== null) return a.number - b.number;
      if (a.number !== null) return -1;
      if (b.number !== null) return 1;
      return a.name.localeCompare(b.name, "pt");
    });

    setPlayers(roster);
    setLoading(false);
  }, [seasonId, supabase]);

  useEffect(() => { load(); }, [load]);

  // Criar jogador — vai ao API route (que usa service role para Storage)
  async function createPlayer(fd: FormData): Promise<boolean> {
    try {
      const res = await fetch("/api/players", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: "Erro ao criar jogador", description: data.error ?? "Erro desconhecido", variant: "destructive" });
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

  // Editar dados desportivos — cria o perfil se ainda não existir nesta época
  // Devolve { ok, playerId } para que o chamador possa usar o ID real mesmo quando
  // o perfil foi criado de raiz (o playerId original era null).
  async function updatePlayer(
    playerId: string | null,
    userId: string,
    data: UpdatePlayerData
  ): Promise<{ ok: boolean; playerId: string | null }> {
    const patch: Record<string, unknown> = {
      number:   data.number   ?? null,
      position: data.position ?? null,
      height:   data.height   ?? null,
      weight:   data.weight   ?? null,
      age:      data.age      ?? null,
    };

    if (playerId) {
      // Atualizar perfil existente
      const { error } = await supabase.from("players").update(patch).eq("id", playerId);
      if (error) {
        toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
        return { ok: false, playerId: null };
      }
    } else {
      // Criar perfil de jogador para esta época
      const { data: created, error } = await supabase
        .from("players")
        .insert({ ...patch, user_id: userId, season_id: seasonId })
        .select("id")
        .single();
      if (error) {
        toast({ title: "Erro ao criar perfil", description: error.message, variant: "destructive" });
        return { ok: false, playerId: null };
      }
      playerId = (created as { id: string }).id;
    }

    toast({ title: "Guardado com sucesso" });
    await load();
    return { ok: true, playerId };
  }

  // Atualizar foto — vai ao API route (service role para Storage)
  async function updatePlayerPhoto(
    playerId: string | null,
    userId: string,
    photo: File,
    opts?: { processedBlob?: Blob | null; focalY?: number; focalX?: number; templateVersion?: number }
  ): Promise<boolean> {
    if (!playerId) {
      toast({ title: "Cria primeiro o perfil desportivo antes de adicionar foto.", variant: "destructive" });
      return false;
    }
    try {
      const fd = new FormData();
      fd.append("player_id", playerId);
      fd.append("photo", photo);
      if (opts?.processedBlob) fd.append("processed_photo", opts.processedBlob, "processed.webp");
      if (opts?.focalY  !== undefined) fd.append("focal_y",          String(opts.focalY));
      if (opts?.focalX  !== undefined) fd.append("focal_x",          String(opts.focalX));
      if (opts?.templateVersion !== undefined) fd.append("template_version", String(opts.templateVersion));
      const res = await fetch("/api/players", { method: "PATCH", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: "Erro ao atualizar foto", description: data.error ?? "Erro desconhecido", variant: "destructive" });
        return false;
      }
      await load();
      return true;
    } catch (e) {
      toast({ title: "Erro de rede", description: (e as Error).message, variant: "destructive" });
      return false;
    }
  }

  // Remover apenas o perfil desportivo (não a conta)
  async function deletePlayer(playerId: string | null, playerName: string): Promise<boolean> {
    if (!playerId) return false;
    if (!confirm(`Remover o perfil de jogador de ${playerName} desta época?`)) return false;
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    if (error) {
      toast({ title: "Erro ao remover perfil", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Perfil de jogador removido desta época" });
    await load();
    return true;
  }

  return { players, loading, createPlayer, updatePlayer, updatePlayerPhoto, deletePlayer, refresh: load };
}
