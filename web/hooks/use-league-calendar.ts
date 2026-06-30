"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { Event } from "@/types/database";

// ─── Tipos ────────────────────────────────────────────────

interface GameMeta {
  jornada: number;
  jogo_num: number;
  home_team: string;
  away_team: string;
  pavilion: string;
  locality: string;
  is_home: boolean;
}

export interface LeagueGame {
  id: string;
  event_date: string;
  event_time: string;
  location: string;
  opponent: string;
  jornada: number;
  jogo_num: number;
  home_team: string;
  away_team: string;
  pavilion: string;
  locality: string;
  is_home: boolean;   // a nossa equipa é visitada (casa)
  is_our_game: boolean;
}

export interface LeagueJornada {
  number: number;
  games: LeagueGame[];
  date_first: string | null;
  our_game: LeagueGame | null;
}

// ─── Parse da description JSON ─────────────────────────────

function parseMeta(event: Event): GameMeta | null {
  if (!event.description) return null;
  try {
    const m = JSON.parse(event.description) as Partial<GameMeta>;
    if (!m.jornada || !m.home_team || !m.away_team) return null;
    return {
      jornada:   Number(m.jornada),
      jogo_num:  Number(m.jogo_num ?? 0),
      home_team: m.home_team,
      away_team: m.away_team,
      pavilion:  m.pavilion  ?? "",
      locality:  m.locality  ?? "",
      is_home:   Boolean(m.is_home),
    };
  } catch {
    return null;
  }
}

function eventToLeagueGame(event: Event): LeagueGame | null {
  const meta = parseMeta(event);
  if (!meta) return null;

  return {
    id:           event.id,
    event_date:   event.event_date,
    event_time:   event.event_time,
    location:     event.location,
    opponent:     event.opponent ?? "",
    jornada:      meta.jornada,
    jogo_num:     meta.jogo_num,
    home_team:    meta.home_team,
    away_team:    meta.away_team,
    pavilion:     meta.pavilion,
    locality:     meta.locality,
    is_home:      meta.is_home,
    is_our_game:  true, // só importamos os nossos jogos
  };
}

// ─── Hook ─────────────────────────────────────────────────

export function useLeagueCalendar(seasonId: string | null) {
  const [rawGames, setRawGames] = useState<LeagueGame[]>([]);
  const [loading, setLoading]   = useState(true);

  // Filtros
  const [showOnlyOurs, setShowOnlyOurs]     = useState(false);
  const [selectedJornada, setSelectedJornada] = useState<number | "all">("all");

  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setRawGames([]); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("season_id", seasonId)
      .eq("type", "jogo")
      .not("description", "is", null)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar calendário", variant: "destructive" });
      setLoading(false);
      return;
    }

    const games = (data ?? [])
      .map((e) => eventToLeagueGame(e as Event))
      .filter((g): g is LeagueGame => g !== null);

    // Deduplicar por data + home + away
    const seen = new Set<string>();
    const unique = games.filter((g) => {
      const key = `${g.event_date}|${g.home_team}|${g.away_team}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Ordenar por jornada → data → hora
    unique.sort((a, b) =>
      a.jornada - b.jornada ||
      a.event_date.localeCompare(b.event_date) ||
      a.event_time.localeCompare(b.event_time)
    );

    setRawGames(unique);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  // Jornadas únicas disponíveis
  const allJornadas = useMemo(
    () => [...new Set(rawGames.map((g) => g.jornada))].sort((a, b) => a - b),
    [rawGames]
  );

  // Jogos filtrados
  const filteredGames = useMemo(() => {
    let gs = rawGames;
    if (showOnlyOurs)          gs = gs.filter((g) => g.is_our_game);
    if (selectedJornada !== "all") gs = gs.filter((g) => g.jornada === selectedJornada);
    return gs;
  }, [rawGames, showOnlyOurs, selectedJornada]);

  // Agrupados por jornada
  const jornadas = useMemo((): LeagueJornada[] => {
    const map = new Map<number, LeagueGame[]>();
    for (const g of filteredGames) {
      if (!map.has(g.jornada)) map.set(g.jornada, []);
      map.get(g.jornada)!.push(g);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, games]) => ({
        number,
        games,
        date_first: games[0]?.event_date ?? null,
        our_game: games.find((g) => g.is_our_game) ?? null,
      }));
  }, [filteredGames]);

  // Stats
  const stats = useMemo(() => ({
    total_jornadas: allJornadas.length,
    total_games:    rawGames.length,
    our_games:      rawGames.filter((g) => g.is_our_game).length,
    home_games:     rawGames.filter((g) => g.is_our_game && g.is_home).length,
    away_games:     rawGames.filter((g) => g.is_our_game && !g.is_home).length,
    next_game:      rawGames.find(
      (g) => g.is_our_game && g.event_date >= new Date().toISOString().slice(0, 10)
    ) ?? null,
  }), [rawGames]);

  return {
    jornadas,
    allJornadas,
    stats,
    loading,
    showOnlyOurs,    setShowOnlyOurs,
    selectedJornada, setSelectedJornada,
    refresh: load,
  };
}
