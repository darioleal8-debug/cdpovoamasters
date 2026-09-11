"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { Event } from "@/types/database";

// ─── Tipos ────────────────────────────────────────────────

interface GameMeta {
  jornada: number;
  volta: number;
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
  competition: string;
  jornada: number;       // raw jornada from file (resets each volta)
  volta: number;         // 1 = 1ª volta, 2 = 2ª volta
  syntheticJornada: number; // globally unique: computed after loading all games
  jogo_num: number;
  home_team: string;
  away_team: string;
  pavilion: string;
  locality: string;
  is_home: boolean;   // a nossa equipa é visitada (casa)
  is_our_game: boolean;
}

export interface LeagueJornada {
  number: number;        // syntheticJornada key
  jornada: number;       // raw jornada number to display
  volta: number;         // volta number for label
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
      volta:     Number(m.volta ?? 1),
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
    id:               event.id,
    event_date:       event.event_date,
    event_time:       event.event_time,
    location:         event.location,
    opponent:         event.opponent ?? "",
    competition:      event.competition ?? "Liga",
    jornada:          meta.jornada,
    volta:            meta.volta,
    syntheticJornada: 0, // computed after all games loaded
    jogo_num:         meta.jogo_num,
    home_team:        meta.home_team,
    away_team:        meta.away_team,
    pavilion:         meta.pavilion,
    locality:         meta.locality,
    is_home:          meta.is_home,
    is_our_game:      true, // só importamos os nossos jogos
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

    // Calcular syntheticJornada: garante unicidade global entre voltas
    // Ex: volta 1 J1-J18 → synthetic 1-18; volta 2 J1-J18 → synthetic 19-36
    const maxJornadaPerVolta = new Map<number, number>();
    for (const g of unique) {
      const prev = maxJornadaPerVolta.get(g.volta) ?? 0;
      if (g.jornada > prev) maxJornadaPerVolta.set(g.volta, g.jornada);
    }
    // offset acumulado por volta (volta 1 → 0, volta 2 → max(volta1), volta 3 → max(volta1)+max(volta2))
    const offsets = new Map<number, number>();
    let acc = 0;
    for (const volta of [...maxJornadaPerVolta.keys()].sort((a, b) => a - b)) {
      offsets.set(volta, acc);
      acc += maxJornadaPerVolta.get(volta) ?? 0;
    }
    for (const g of unique) {
      g.syntheticJornada = (offsets.get(g.volta) ?? 0) + g.jornada;
    }

    // Ordenar por syntheticJornada → data → hora
    unique.sort((a, b) =>
      a.syntheticJornada - b.syntheticJornada ||
      a.event_date.localeCompare(b.event_date) ||
      a.event_time.localeCompare(b.event_time)
    );

    setRawGames(unique);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  // Jornadas únicas disponíveis (pelo syntheticJornada)
  const allJornadas = useMemo(
    () => [...new Set(rawGames.map((g) => g.syntheticJornada))].sort((a, b) => a - b),
    [rawGames]
  );

  // Metadata por syntheticJornada (para labels amigáveis no UI)
  const jornadaMeta = useMemo((): Record<number, { jornada: number; volta: number }> => {
    const meta: Record<number, { jornada: number; volta: number }> = {};
    for (const g of rawGames) {
      if (!(g.syntheticJornada in meta)) {
        meta[g.syntheticJornada] = { jornada: g.jornada, volta: g.volta };
      }
    }
    return meta;
  }, [rawGames]);

  // Jogos filtrados
  const filteredGames = useMemo(() => {
    let gs = rawGames;
    if (showOnlyOurs)              gs = gs.filter((g) => g.is_our_game);
    if (selectedJornada !== "all") gs = gs.filter((g) => g.syntheticJornada === selectedJornada);
    return gs;
  }, [rawGames, showOnlyOurs, selectedJornada]);

  // Agrupados por syntheticJornada
  const jornadas = useMemo((): LeagueJornada[] => {
    const map = new Map<number, LeagueGame[]>();
    for (const g of filteredGames) {
      if (!map.has(g.syntheticJornada)) map.set(g.syntheticJornada, []);
      map.get(g.syntheticJornada)!.push(g);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, games]) => ({
        number,
        jornada: games[0]?.jornada ?? number,
        volta:   games[0]?.volta ?? 1,
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
    jornadaMeta,
    stats,
    loading,
    showOnlyOurs,    setShowOnlyOurs,
    selectedJornada, setSelectedJornada,
    refresh: load,
  };
}
