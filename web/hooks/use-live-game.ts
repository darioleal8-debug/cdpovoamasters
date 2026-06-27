"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type {
  GameSession, PlayByPlay, PlayerGameStats,
  PlayerGameStatsWithUser, GamePeriodScore, PlayEventType,
} from "@/types/database";
import type { PlayerWithUser } from "@/types/database";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function computeClockSecs(session: GameSession | null): number {
  if (!session) return 600;
  let elapsed = session.clock_elapsed_secs ?? 0;
  if (session.clock_running && session.clock_started_at) {
    elapsed += (Date.now() - new Date(session.clock_started_at).getTime()) / 1000;
  }
  return Math.max(0, (session.period_duration_secs ?? 600) - elapsed);
}

const POINTS_MAP: Partial<Record<PlayEventType, number>> = {
  "2pt_made": 2, "3pt_made": 3, "ft_made": 1,
};

function statDeltaForEvent(type: PlayEventType): Partial<Record<string, number>> {
  switch (type) {
    case "2pt_made":       return { pts: 2, fg2_made: 1, fg2_att: 1 };
    case "2pt_miss":       return { fg2_att: 1 };
    case "3pt_made":       return { pts: 3, fg3_made: 1, fg3_att: 1 };
    case "3pt_miss":       return { fg3_att: 1 };
    case "ft_made":        return { pts: 1, ft_made: 1, ft_att: 1 };
    case "ft_miss":        return { ft_att: 1 };
    case "rebound_off":    return { reb_off: 1 };
    case "rebound_def":    return { reb_def: 1 };
    case "assist":         return { ast: 1 };
    case "steal":          return { stl: 1 };
    case "block":          return { blk: 1 };
    case "turnover":       return { tov: 1 };
    case "foul_committed": return { fouls_committed: 1 };
    case "foul_drawn":     return { fouls_drawn: 1 };
    default: return {};
  }
}

function calcEfficiency(s: Partial<PlayerGameStats>): number {
  return (
    (s.pts ?? 0) + (s.reb_off ?? 0) + (s.reb_def ?? 0) +
    (s.ast ?? 0) + (s.stl ?? 0) + (s.blk ?? 0) - (s.tov ?? 0) -
    ((s.fg2_att ?? 0) - (s.fg2_made ?? 0)) -
    ((s.fg3_att ?? 0) - (s.fg3_made ?? 0)) -
    ((s.ft_att ?? 0) - (s.ft_made ?? 0))
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseLiveGameOptions {
  realtimeOnly?: boolean; // spectator mode: subscribe only, no writes
}

export function useLiveGame(
  eventId: string,
  opts: UseLiveGameOptions = {}
) {
  const supabase = createClient();
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [roster, setRoster] = useState<PlayerWithUser[]>([]);
  const [onCourtIds, setOnCourtIds] = useState<string[]>([]);
  const [plays, setPlays] = useState<PlayByPlay[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerGameStatsWithUser[]>([]);
  const [periodScores, setPeriodScores] = useState<GamePeriodScore[]>([]);
  const [clockSecs, setClockSecs] = useState(600);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const sessionRef = useRef<GameSession | null>(null);
  sessionRef.current = session;

  // ── Season ──────────────────────────────────────────────
  useEffect(() => {
    supabase.from("seasons").select("id").eq("status", "ativa").single()
      .then(({ data }) => { if (data) setSeasonId(data.id); });
  }, []);

  // ── Load functions ──────────────────────────────────────
  const loadRoster = useCallback(async (sid: string) => {
    const { data } = await supabase
      .from("player_profiles")
      .select("*, user:users(id, name, email, status)")
      .eq("season_id", sid)
      .order("jersey_number", { ascending: true, nullsFirst: false });
    setRoster((data ?? []) as unknown as PlayerWithUser[]);
  }, []);

  const loadPlays = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("play_by_play")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(100);
    setPlays(data ?? []);
  }, []);

  const loadPlayerStats = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("player_game_stats")
      .select("*, user:users(id, name)")
      .eq("game_session_id", sessionId);
    setPlayerStats((data ?? []) as unknown as PlayerGameStatsWithUser[]);
  }, []);

  const loadPeriodScores = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("game_period_scores")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("period");
    setPeriodScores(data ?? []);
  }, []);

  const loadLineup = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("game_current_lineup")
      .select("on_court_ids")
      .eq("game_session_id", sessionId)
      .single();
    setOnCourtIds(data?.on_court_ids ?? []);
  }, []);

  const loadSession = useCallback(async () => {
    const { data } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("event_id", eventId)
      .single();
    if (data) {
      setSession(data as GameSession);
      setClockSecs(computeClockSecs(data as GameSession));
      return data as GameSession;
    }
    return null;
  }, [eventId]);

  const loadAll = useCallback(async (sid: string) => {
    setLoading(true);
    const [sess] = await Promise.all([loadSession(), loadRoster(sid)]);
    if (sess) {
      await Promise.all([
        loadPlays(sess.id),
        loadPlayerStats(sess.id),
        loadPeriodScores(sess.id),
        loadLineup(sess.id),
      ]);
    }
    setLoading(false);
  }, [loadSession, loadRoster, loadPlays, loadPlayerStats, loadPeriodScores, loadLineup]);

  useEffect(() => {
    if (seasonId) loadAll(seasonId);
  }, [seasonId, loadAll]);

  // ── Client-side clock tick ──────────────────────────────
  useEffect(() => {
    if (!session?.clock_running) return;
    const interval = setInterval(() => {
      setClockSecs(computeClockSecs(sessionRef.current));
    }, 500);
    return () => clearInterval(interval);
  }, [session?.clock_running]);

  useEffect(() => {
    if (session) setClockSecs(computeClockSecs(session));
  }, [session?.clock_elapsed_secs, session?.clock_running, session?.clock_started_at]);

  // ── Realtime subscriptions ──────────────────────────────
  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`live-game-${session.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${session.id}` },
        (payload) => { setSession(payload.new as GameSession); })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "play_by_play", filter: `game_session_id=eq.${session.id}` },
        () => { loadPlays(session.id); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "player_game_stats", filter: `game_session_id=eq.${session.id}` },
        () => { loadPlayerStats(session.id); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_current_lineup", filter: `game_session_id=eq.${session.id}` },
        (payload) => { setOnCourtIds((payload.new as { on_court_ids: string[] }).on_court_ids ?? []); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  // ── Clock controls ──────────────────────────────────────

  async function startClock(): Promise<void> {
    if (!session || session.clock_running) return;
    await supabase.from("game_sessions").update({
      clock_running: true,
      clock_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);
  }

  async function stopClock(): Promise<void> {
    if (!session || !session.clock_running) return;
    const elapsed = session.clock_elapsed_secs +
      (Date.now() - new Date(session.clock_started_at!).getTime()) / 1000;
    await supabase.from("game_sessions").update({
      clock_running: false,
      clock_elapsed_secs: Math.floor(elapsed),
      clock_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);
  }

  async function resetClock(): Promise<void> {
    if (!session) return;
    await supabase.from("game_sessions").update({
      clock_running: false,
      clock_elapsed_secs: 0,
      clock_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);
    setClockSecs(session.period_duration_secs ?? 600);
  }

  // ── Start game ──────────────────────────────────────────

  async function startGame(
    opponentName: string,
    startingFiveIds: string[]
  ): Promise<boolean> {
    if (!seasonId) return false;
    setRecording(true);
    try {
      const { data, error } = await supabase
        .from("game_sessions")
        .insert({
          event_id: eventId,
          season_id: seasonId,
          opponent_name: opponentName || "Adversário",
          status: "live",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        toast({ title: "Erro ao iniciar jogo", description: error.message, variant: "destructive" });
        return false;
      }

      await Promise.all([
        supabase.from("play_by_play").insert({
          game_session_id: data.id,
          season_id: seasonId,
          period: 1,
          event_type: "game_start",
          is_home_team: true,
          points_delta: 0,
          home_score_after: 0,
          away_score_after: 0,
          description: "Início do jogo",
        }),
        roster.length > 0
          ? supabase.from("player_game_stats").insert(
              roster.map((p) => ({
                game_session_id: data.id,
                season_id: seasonId,
                player_id: p.user_id,
              }))
            )
          : Promise.resolve(),
        supabase.from("game_current_lineup").insert({
          game_session_id: data.id,
          on_court_ids: startingFiveIds.slice(0, 5),
        }),
      ]);

      // Open stints for starting 5
      if (startingFiveIds.length > 0) {
        await supabase.from("player_court_stints").insert(
          startingFiveIds.slice(0, 5).map((pid) => ({
            game_session_id: data.id,
            player_id: pid,
            period: 1,
            entry_clock_secs: data.period_duration_secs ?? 600,
            entry_home_score: 0,
            entry_away_score: 0,
          }))
        );
      }

      setSession(data as GameSession);
      setOnCourtIds(startingFiveIds.slice(0, 5));
      await Promise.all([loadPlays(data.id), loadPlayerStats(data.id)]);
      toast({ title: "🏀 Jogo iniciado!" });
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Record event ────────────────────────────────────────

  async function recordPlay(input: {
    event_type: PlayEventType;
    player_id?: string;
    secondary_player_id?: string;
    game_clock?: string;
  }): Promise<boolean> {
    if (!session || recording) return false;
    setRecording(true);
    try {
      const pts = POINTS_MAP[input.event_type] ?? 0;
      const newHome = session.home_score + pts;
      const clockStr = input.game_clock ?? formatClock(clockSecs);

      const { error } = await supabase.from("play_by_play").insert({
        game_session_id: session.id,
        season_id: session.season_id,
        period: session.current_period,
        game_clock: clockStr,
        clock_time_secs: Math.round(clockSecs),
        event_type: input.event_type,
        player_id: input.player_id ?? null,
        secondary_player_id: input.secondary_player_id ?? null,
        is_home_team: true,
        points_delta: pts,
        home_score_after: newHome,
        away_score_after: session.away_score,
      });

      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return false;
      }

      if (pts > 0) {
        await supabase.from("game_sessions")
          .update({ home_score: newHome, updated_at: new Date().toISOString() })
          .eq("id", session.id);
        setSession((s) => s ? { ...s, home_score: newHome } : s);
      }

      if (input.player_id) {
        const delta = statDeltaForEvent(input.event_type);
        if (Object.keys(delta).length > 0) {
          const existing = playerStats.find((s) => s.player_id === input.player_id);
          const base: Partial<PlayerGameStats> = existing ?? {
            game_session_id: session.id,
            season_id: session.season_id,
            player_id: input.player_id,
          };
          const updated = { ...base };
          for (const [k, v] of Object.entries(delta)) {
            if (v !== undefined) {
              (updated as Record<string, number>)[k] =
                ((updated as Record<string, number>)[k] ?? 0) + v;
            }
          }
          updated.efficiency = calcEfficiency(updated);
          await supabase.from("player_game_stats").upsert(
            { ...updated, updated_at: new Date().toISOString() },
            { onConflict: "game_session_id,player_id" }
          );
        }
      }

      // Assist for secondary player (when shot is made)
      if (input.secondary_player_id && input.event_type.endsWith("_made")) {
        const existing = playerStats.find((s) => s.player_id === input.secondary_player_id);
        const base: Partial<PlayerGameStats> = existing ?? {
          game_session_id: session.id,
          season_id: session.season_id,
          player_id: input.secondary_player_id,
        };
        const updated = { ...base, ast: ((base.ast ?? 0) + 1) };
        updated.efficiency = calcEfficiency(updated);
        await supabase.from("player_game_stats").upsert(
          { ...updated, updated_at: new Date().toISOString() },
          { onConflict: "game_session_id,player_id" }
        );
      }

      await Promise.all([loadPlays(session.id), loadPlayerStats(session.id)]);
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent points ─────────────────────────────────────

  async function recordOpponentPoints(pts: number): Promise<void> {
    if (!session) return;
    const newAway = session.away_score + pts;
    await supabase.from("game_sessions")
      .update({ away_score: newAway, updated_at: new Date().toISOString() })
      .eq("id", session.id);
    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: session.season_id,
      period: session.current_period,
      game_clock: formatClock(clockSecs),
      clock_time_secs: Math.round(clockSecs),
      event_type: pts === 1 ? "ft_made" : pts === 3 ? "3pt_made" : "2pt_made",
      is_home_team: false,
      points_delta: pts,
      home_score_after: session.home_score,
      away_score_after: newAway,
      description: `Adversário +${pts}`,
    });
    setSession((s) => s ? { ...s, away_score: newAway } : s);
    await loadPlays(session.id);
  }

  // ── Substitution ────────────────────────────────────────

  async function substitutePlayer(inId: string, outId: string): Promise<void> {
    if (!session) return;
    const newLineup = onCourtIds.filter((id) => id !== outId).concat(inId);

    await supabase.from("game_current_lineup").upsert(
      { game_session_id: session.id, on_court_ids: newLineup, updated_at: new Date().toISOString() },
      { onConflict: "game_session_id" }
    );

    const clockStr = formatClock(clockSecs);
    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: session.season_id,
      period: session.current_period,
      game_clock: clockStr,
      clock_time_secs: Math.round(clockSecs),
      event_type: "substitution_in",
      player_id: inId,
      secondary_player_id: outId,
      is_home_team: true,
      points_delta: 0,
      home_score_after: session.home_score,
      away_score_after: session.away_score,
      description: `Sub: entra #${roster.find((p) => p.user_id === inId)?.jersey_number} sai #${roster.find((p) => p.user_id === outId)?.jersey_number}`,
    });

    // Close outgoing player's stint
    await supabase.from("player_court_stints")
      .update({
        exit_clock_secs: Math.round(clockSecs),
        exit_home_score: session.home_score,
        exit_away_score: session.away_score,
      })
      .eq("game_session_id", session.id)
      .eq("player_id", outId)
      .is("exit_clock_secs", null);

    // Open incoming player's stint
    await supabase.from("player_court_stints").insert({
      game_session_id: session.id,
      player_id: inId,
      period: session.current_period,
      entry_clock_secs: Math.round(clockSecs),
      entry_home_score: session.home_score,
      entry_away_score: session.away_score,
    });

    setOnCourtIds(newLineup);
    await loadPlays(session.id);
  }

  // ── Timeout ─────────────────────────────────────────────

  async function callTimeout(team: "home" | "away"): Promise<void> {
    if (!session) return;
    const field = team === "home" ? "home_timeouts_left" : "away_timeouts_left";
    const current = team === "home" ? session.home_timeouts_left : session.away_timeouts_left;
    if (current <= 0) { toast({ title: "Sem timeouts disponíveis" }); return; }

    await supabase.from("game_sessions")
      .update({ [field]: current - 1, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: session.season_id,
      period: session.current_period,
      game_clock: formatClock(clockSecs),
      event_type: "timeout",
      is_home_team: team === "home",
      points_delta: 0,
      home_score_after: session.home_score,
      away_score_after: session.away_score,
      description: `Timeout ${team === "home" ? "CD Póvoa" : "Adversário"}`,
    });

    setSession((s) => s ? { ...s, [field]: current - 1 } : s);
    await loadPlays(session.id);
    toast({ title: `Timeout ${team === "home" ? "CD Póvoa" : "Adversário"}` });
  }

  // ── Undo ────────────────────────────────────────────────

  async function undoLastPlay(): Promise<boolean> {
    if (!session) return false;
    setRecording(true);
    try {
      const { data, error } = await supabase.rpc("undo_last_play", {
        p_game_session_id: session.id,
      });
      if (error) {
        toast({ title: "Erro ao desfazer", description: error.message, variant: "destructive" });
        return false;
      }
      if (!data?.length) {
        toast({ title: "Nada a desfazer" });
        return false;
      }
      await Promise.all([
        loadPlays(session.id),
        loadPlayerStats(session.id),
        loadSession(),
      ]);
      toast({ title: "Evento desfeito" });
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Next period ─────────────────────────────────────────

  async function nextPeriod(): Promise<void> {
    if (!session) return;
    const nextP = session.current_period + 1;

    // Stop clock
    if (session.clock_running) await stopClock();

    await supabase.from("game_period_scores").upsert(
      { game_session_id: session.id, period: session.current_period, home_score: session.home_score, away_score: session.away_score },
      { onConflict: "game_session_id,period" }
    );

    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: session.season_id,
      period: session.current_period,
      event_type: "period_end",
      is_home_team: true,
      points_delta: 0,
      home_score_after: session.home_score,
      away_score_after: session.away_score,
      description: `Fim do ${session.current_period}º período`,
    });

    // Close all open stints
    await supabase.from("player_court_stints")
      .update({ exit_clock_secs: 0, exit_home_score: session.home_score, exit_away_score: session.away_score })
      .eq("game_session_id", session.id)
      .is("exit_clock_secs", null);

    await supabase.from("game_sessions").update({
      current_period: nextP,
      clock_running: false,
      clock_elapsed_secs: 0,
      clock_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);

    // Re-open stints for on-court players in new period
    if (onCourtIds.length > 0) {
      await supabase.from("player_court_stints").insert(
        onCourtIds.map((pid) => ({
          game_session_id: session.id,
          player_id: pid,
          period: nextP,
          entry_clock_secs: session.period_duration_secs ?? 600,
          entry_home_score: session.home_score,
          entry_away_score: session.away_score,
        }))
      );
    }

    setSession((s) => s ? { ...s, current_period: nextP, clock_running: false, clock_elapsed_secs: 0, clock_started_at: null } : s);
    setClockSecs(session.period_duration_secs ?? 600);
    await Promise.all([loadPeriodScores(session.id), loadPlays(session.id)]);
  }

  // ── Finish game ─────────────────────────────────────────

  async function finishGame(): Promise<boolean> {
    if (!session) return false;

    if (session.clock_running) await stopClock();

    await supabase.from("player_court_stints")
      .update({ exit_clock_secs: 0, exit_home_score: session.home_score, exit_away_score: session.away_score })
      .eq("game_session_id", session.id)
      .is("exit_clock_secs", null);

    // Update seconds_played for each player from stints
    const { data: stints } = await supabase
      .from("player_court_stints")
      .select("player_id, entry_clock_secs, exit_clock_secs")
      .eq("game_session_id", session.id);

    if (stints && stints.length > 0) {
      const secsMap: Record<string, number> = {};
      for (const stint of stints) {
        const secs = stint.entry_clock_secs - (stint.exit_clock_secs ?? 0);
        secsMap[stint.player_id] = (secsMap[stint.player_id] ?? 0) + Math.max(0, secs);
      }
      await Promise.all(
        Object.entries(secsMap).map(([pid, secs]) =>
          supabase.from("player_game_stats")
            .update({ seconds_played: Math.round(secs), updated_at: new Date().toISOString() })
            .eq("game_session_id", session.id)
            .eq("player_id", pid)
        )
      );
    }

    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: session.season_id,
      period: session.current_period,
      event_type: "game_end",
      is_home_team: true,
      points_delta: 0,
      home_score_after: session.home_score,
      away_score_after: session.away_score,
      description: `Fim — CD Póvoa ${session.home_score} vs ${session.away_score} ${session.opponent_name}`,
    });

    await supabase.from("game_sessions").update({
      status: "finished",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);

    setSession((s) => s ? { ...s, status: "finished" } : s);
    toast({ title: "🏁 Jogo terminado!", description: "Estatísticas guardadas." });
    return true;
  }

  // ── Derived ─────────────────────────────────────────────
  const onCourt = roster.filter((p) => onCourtIds.includes(p.user_id));
  const bench = roster.filter((p) => !onCourtIds.includes(p.user_id));

  return {
    seasonId, session, roster, onCourt, bench, onCourtIds,
    plays, playerStats, periodScores, clockSecs,
    loading, recording,
    startGame, startClock, stopClock, resetClock,
    recordPlay, recordOpponentPoints,
    substitutePlayer, callTimeout, undoLastPlay,
    nextPeriod, finishGame,
  };
}
