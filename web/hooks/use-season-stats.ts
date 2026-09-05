"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

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

// Filter for stat queries — corresponds to game_type column on events
// 'all'       → todos os jogos (official + friendly)
// 'official'  → apenas jogos oficiais
// 'friendly'  → apenas jogos de treino/amigáveis
// competition → apenas jogos dessa competição (implica official)
export interface StatsFilter {
  gameType: "all" | "official" | "friendly";
  competition?: string; // e.g. 'Liga', 'Taça'
}

export const DEFAULT_STATS_FILTER: StatsFilter = { gameType: "all" };

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
      // ── 1. Determine which game_session_ids match the filter ──────────────────
      //
      // player_game_stats.season_id is enough to scope to the season.
      // For game_type / competition filters we need to join:
      //   player_game_stats → game_sessions → events
      //
      // Strategy: if filter is 'all' and no competition, skip the join and
      // query player_game_stats directly. Otherwise, first resolve the matching
      // game_session_ids, then filter stats by those ids.

      const needsJoin = filter.gameType !== "all" || !!filter.competition;

      let allowedSessionIds: string[] | null = null;

      if (needsJoin) {
        // Build the events query for the matching game_type / competition
        let eventsQ = supabase
          .from("events")
          .select("id")
          .eq("season_id", seasonId)
          .eq("type", "jogo");

        if (filter.gameType === "official")  eventsQ = eventsQ.eq("game_type", "official");
        if (filter.gameType === "friendly")  eventsQ = eventsQ.eq("game_type", "friendly");
        if (filter.competition)              eventsQ = eventsQ.eq("competition", filter.competition);

        const { data: evData } = await eventsQ;
        const eventIds = (evData ?? []).map((e) => e.id);

        if (eventIds.length === 0) {
          // No matching games — return empty stats
          setStats({
            total_pts: 0, total_reb: 0, total_ast: 0, total_stl: 0,
            total_blk: 0, total_tov: 0, total_fouls_committed: 0,
            total_fouls_drawn: 0, games_finished: 0, total_players: 0,
          });
          setLoading(false);
          return;
        }

        // Resolve game_session_ids for those events
        const { data: sessData } = await supabase
          .from("game_sessions")
          .select("id")
          .in("event_id", eventIds)
          .eq("status", "finished");

        allowedSessionIds = (sessData ?? []).map((s) => s.id);

        if (allowedSessionIds.length === 0) {
          setStats({
            total_pts: 0, total_reb: 0, total_ast: 0, total_stl: 0,
            total_blk: 0, total_tov: 0, total_fouls_committed: 0,
            total_fouls_drawn: 0, games_finished: 0, total_players: 0,
          });
          setLoading(false);
          return;
        }
      }

      // ── 2. Fetch stats ────────────────────────────────────────────────────────

      const [statsRes, gamesRes, playersRes] = await Promise.all([
        // Player stats — filtered by session ids when filter is active
        (() => {
          let q = supabase
            .from("player_game_stats")
            .select("pts, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, fouls_drawn")
            .eq("season_id", seasonId);
          if (allowedSessionIds) q = q.in("game_session_id", allowedSessionIds);
          return q;
        })(),

        // Finished game count
        (() => {
          if (allowedSessionIds) {
            return supabase
              .from("game_sessions")
              .select("id", { count: "exact", head: true })
              .in("id", allowedSessionIds);
          }
          return supabase
            .from("game_sessions")
            .select("id", { count: "exact", head: true })
            .eq("season_id", seasonId)
            .eq("status", "finished");
        })(),

        // Total players in season (not affected by game filter)
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
  }, [seasonId, filter.gameType, filter.competition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  return { stats, loading };
}
