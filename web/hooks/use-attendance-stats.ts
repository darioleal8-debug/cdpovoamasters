"use client";

import { useEffect, useState, useCallback } from "react";

export interface PlayerAttendanceStat {
  player_id: string;
  user_id:   string;
  name:      string;
  number:    number | null;
  training:  {
    total:     number;
    present:   number;
    absent:    number;
    justified: number;
    late:      number;
    pct:       number;
  } | null;
  games: {
    total_with_stats: number;
    present:          number;
    pct:              number | null;
  } | null;
  global_pct: number | null;
}

export interface AttendanceStatsResponse {
  players: PlayerAttendanceStat[];
  season: {
    total_games:      number;
    games_with_stats: number;
  };
  team_avg: {
    training_pct: number | null;
    games_pct:    number | null;
    global_pct:   number | null;
  };
  is_privileged: boolean;
}

export interface PlayerDetailSession {
  training_sessions: Array<{
    id:     string;
    date:   string;
    title:  string;
    status: string;
  }>;
  game_sessions: Array<{
    game_session_id: string;
    date:     string;
    opponent: string;
    home_score: number | null;
    away_score: number | null;
    pts:  number;
    reb:  number;
    ast:  number;
    stl:  number;
    blk:  number;
    tov:  number;
    minutes: number | null;
  }>;
}

export function useAttendanceStats(seasonId: string | null) {
  const [data, setData]       = useState<AttendanceStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seasonId) { setData(null); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance-stats?seasonId=${seasonId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, refresh: load };
}

export async function fetchPlayerDetail(
  playerId: string,
  seasonId: string
): Promise<PlayerDetailSession | null> {
  const res = await fetch(
    `/api/attendance-stats/${playerId}?seasonId=${seasonId}`
  );
  if (!res.ok) return null;
  return res.json();
}
