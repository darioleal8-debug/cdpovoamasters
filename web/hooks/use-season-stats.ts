"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getOfficialGameSessionIds } from "@/lib/stats/official-games";

export interface SeasonGameStats {
  total_pts: number;
  total_reb: number;
  total_ast: number;
  total_stl: number;
  total_blk: number;
  total_tov: number;
  total_fouls_committed: number;
  total_fouls_drawn: number;
  games_finished: number;
  total_players: number;
}

// As estatísticas só contabilizam jogos oficiais (ver lib/stats/official-games).
// O filtro opcional restringe a uma competição específica (ex.: 'Liga', 'Taça').
export interface StatsFilter {
  competition?: string;
}

export const DEFAULT_STATS_FILTER: StatsFilter = {};

export function useSeasonStats(
  seasonId: string | null,
  filter: StatsFilter = DEFAULT_STATS_FILTER,
) {
  const [stats, setStats] = useState<SeasonGameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setStats(null); setLoading(false); return; }
    setLoading(true);
    try {
      // ── 1. Sessões de jogos oficiais terminados (exclui treinos/amigáveis, testes e eliminados)
      const allowedSessionIds = await getOfficialGameSessionIds(supabase, seasonId, {
        competition:  filter.competition,
        finishedOnly: true,
      });

      if (allowedSessionIds.length === 0) {
        setStats({
          total_pts: 0, total_reb: 0, total_ast: 0, total_stl: 0,
          total_blk: 0, total_tov: 0, total_fouls_committed: 0,
          total_fouls_drawn: 0, games_finished: 0, total_players: 0,
        });
        setLoading(false);
        return;
      }

      // ── 2. Fetch stats ────────────────────────────────────────────────────────

      const [statsRes, gamesRes, playersRes] = await Promise.all([
        supabase
          .from("player_game_stats")
          .select("pts, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, fouls_drawn")
          .eq("season_id", seasonId)
          .in("game_session_id", allowedSessionIds),

        supabase
          .from("game_sessions")
          .select("id", { count: "exact", head: true })
          .in("id", allowedSessionIds),

        supabase
          .from("players")
          .select("id", { count: "exact", head: true })
          .eq("season_id", seasonId),
      ]);

      const rows = statsRes.data ?? [];
      setStats({
        total_pts:             rows.reduce((s, r) => s + (r.pts ?? 0), 0),
        total_reb:             rows.reduce((s, r) => s + (r.reb_off ?? 0) + (r.reb_def ?? 0), 0),
        total_ast:             rows.reduce((s, r) => s + (r.ast ?? 0), 0),
        total_stl:             rows.reduce((s, r) => s + (r.stl ?? 0), 0),
        total_blk:             rows.reduce((s, r) => s + (r.blk ?? 0), 0),
        total_tov:             rows.reduce((s, r) => s + (r.tov ?? 0), 0),
        total_fouls_committed: rows.reduce((s, r) => s + (r.fouls_committed ?? 0), 0),
        total_fouls_drawn:     rows.reduce((s, r) => s + (r.fouls_drawn ?? 0), 0),
        games_finished:        gamesRes.count ?? 0,
        total_players:         playersRes.count ?? 0,
      });
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [seasonId, filter.competition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  return { stats, loading };
}
