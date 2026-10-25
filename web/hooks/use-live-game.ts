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

  // ── Season — derivada do evento, não da temporada activa ─
  useEffect(() => {
    supabase.from("events").select("season_id").eq("id", eventId).single()
      .then(({ data }) => { if (data?.season_id) setSeasonId(data.season_id as string); });
  }, [eventId]);

  // ── Load functions ──────────────────────────────────────
  const loadRoster = useCallback(async (sid: string) => {
    // Step 1: get the player row IDs convoked for this game
    const { data: callups } = await supabase
      .from("game_callups")
      .select("player_id")
      .eq("game_id", eventId);

    if (!callups || callups.length === 0) {
      setRoster([]);
      return [];
    }

    const playerIds = callups.map((c) => c.player_id as string);

    // Step 2: fetch players rows (name, jersey number, optional user_id)
    const { data: playersData } = await supabase
      .from("players")
      .select("id, number, user_id") // players.name foi removida (041); o nome vem de users (STA-01)
      .in("id", playerIds)
      .order("number", { ascending: true });

    if (!playersData || playersData.length === 0) {
      setRoster([]);
      return [];
    }

    // Step 3: for players linked to an auth account, fetch extra data in parallel
    const linkedUserIds = playersData
      .map((p) => p.user_id as string | null)
      .filter(Boolean) as string[];

    const usersMap: Record<string, { id: string; name: string }> = {};
    const profilesMap: Record<string, { jersey_number: number | null }> = {};

    if (linkedUserIds.length > 0) {
      const [{ data: usersData }, { data: profileData }] = await Promise.all([
        supabase.from("users").select("id, name").in("id", linkedUserIds),
        supabase.from("player_profiles").select("user_id, jersey_number").in("user_id", linkedUserIds),
      ]);
      for (const u of usersData ?? []) usersMap[u.id] = u;
      for (const p of profileData ?? []) profilesMap[p.user_id] = p;
    }

    // Step 4: build a PlayerWithUser-compatible roster
    // Always use players.id as the stable key so it matches player_game_stats.player_id
    const items = playersData.map((p) => {
      const uid = p.id as string;
      const userData = (p.user_id as string | null) ? usersMap[p.user_id as string] : undefined;
      const profileEntry = (p.user_id as string | null) ? profilesMap[p.user_id as string] : undefined;
      return {
        user_id: uid,
        season_id: sid,
        jersey_number: profileEntry?.jersey_number ?? (p.number as number | null) ?? null,
        position: null,
        height_cm: null,
        age: null,
        user: {
          id: uid,
          name: userData?.name ?? "—",
          email: "",
          status: "ativo",
        },
      };
    });

    setRoster(items as unknown as PlayerWithUser[]);
    return items as unknown as PlayerWithUser[];
  }, [eventId]);

  const loadPlays = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("play_by_play")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(500);
    setPlays(data ?? []);
  }, []);

  const loadPlayerStats = useCallback(async (sessionId: string) => {
    // players.name foi removido na migration 041 — enriquecer via v_roster
    const [statsRes, stintsRes] = await Promise.all([
      supabase
        .from("player_game_stats")
        .select("*")
        .eq("game_session_id", sessionId),
      supabase
        .from("player_court_stints")
        .select("player_id, entry_clock_secs, exit_clock_secs, entry_home_score, entry_away_score, exit_home_score, exit_away_score")
        .eq("game_session_id", sessionId),
    ]);

    const rawStats = (statsRes.data ?? []) as (PlayerGameStats & { player_id: string })[];
    const playerIds = [...new Set(rawStats.map((s) => s.player_id))];
    const { data: rosterRows } = playerIds.length > 0
      ? await supabase.from("v_roster").select("player_id, name").in("player_id", playerIds)
      : { data: [] };
    const nameById = new Map((rosterRows ?? []).map((r) => [r.player_id as string, r.name as string]));
    const stats: PlayerGameStatsWithUser[] = rawStats.map((s) => ({
      ...s,
      user: { id: s.player_id, name: nameById.get(s.player_id) ?? "?" },
    }));
    const stints = stintsRes.data ?? [];

    // Compute seconds_played and plus_minus from court stints
    if (stints.length > 0) {
      const nowSecs = Math.round(computeClockSecs(sessionRef.current));
      const nowHome = sessionRef.current?.home_score ?? 0;
      const nowAway = sessionRef.current?.away_score ?? 0;
      const secsMap: Record<string, number> = {};
      const pmMap: Record<string, number> = {};
      for (const s of stints) {
        const isOpen = (s.exit_clock_secs as number | null) == null;
        const exit = isOpen ? nowSecs : (s.exit_clock_secs as number);
        secsMap[s.player_id as string] = (secsMap[s.player_id as string] ?? 0) + Math.max(0, (s.entry_clock_secs as number) - exit);
        const exitHome = isOpen ? nowHome : ((s.exit_home_score as number | null) ?? nowHome);
        const exitAway = isOpen ? nowAway : ((s.exit_away_score as number | null) ?? nowAway);
        const entryHome = (s.entry_home_score as number | null) ?? 0;
        const entryAway = (s.entry_away_score as number | null) ?? 0;
        pmMap[s.player_id as string] = (pmMap[s.player_id as string] ?? 0) + (exitHome - exitAway) - (entryHome - entryAway);
      }
      for (const stat of stats) {
        const pid = stat.player_id as string;
        if (pid in secsMap) (stat as unknown as Record<string, unknown>).seconds_played = secsMap[pid];
        if (pid in pmMap) (stat as unknown as Record<string, unknown>).plus_minus = pmMap[pid];
      }
    }

    setPlayerStats(stats);
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
      .maybeSingle();
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
        { event: "*", schema: "public", table: "play_by_play", filter: `game_session_id=eq.${session.id}` },
        () => { loadPlays(session.id); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "player_game_stats", filter: `game_session_id=eq.${session.id}` },
        () => { loadPlayerStats(session.id); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_period_scores", filter: `game_session_id=eq.${session.id}` },
        () => { loadPeriodScores(session.id); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "player_court_stints", filter: `game_session_id=eq.${session.id}` },
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
    startingFiveIds: string[],
    callupPlayerIds?: string[]
  ): Promise<boolean> {
    if (!seasonId) return false;
    setRecording(true);
    try {
      let rosterToUse = roster;
      if (callupPlayerIds && callupPlayerIds.length > 0) {
        await supabase.from("game_callups").insert(
          callupPlayerIds.map((pid) => ({ game_id: eventId, player_id: pid }))
        );
        rosterToUse = await loadRoster(seasonId);
      }
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
        rosterToUse.length > 0
          ? supabase.from("player_game_stats").insert(
              rosterToUse.map((p) => ({
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
    description?: string;
  }): Promise<boolean> {
    if (!session || recording) return false;
    setRecording(true);
    try {
      const { error } = await supabase.rpc("record_play", {
        p_game_session_id:     session.id,
        p_event_type:          input.event_type,
        p_period:              session.current_period,
        p_clock_time_secs:     Math.round(clockSecs),
        p_is_home_team:        true,
        p_points_delta:        POINTS_MAP[input.event_type] ?? 0,
        p_player_id:           input.player_id ?? null,
        p_secondary_player_id: input.secondary_player_id ?? null,
        p_game_clock:          input.game_clock ?? formatClock(clockSecs),
        p_description:         input.description ?? null,
      });

      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return false;
      }

      await Promise.all([loadPlays(session.id), loadPlayerStats(session.id)]);
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent points ─────────────────────────────────────

  async function recordOpponentPoints(pts: number): Promise<void> {
    if (!session || recording) return;
    setRecording(true);
    try {
      await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      pts === 1 ? "ft_made" : pts === 3 ? "3pt_made" : "2pt_made",
        p_period:          session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_is_home_team:    false,
        p_points_delta:    pts,
        p_game_clock:      formatClock(clockSecs),
        p_description:     `Adversário +${pts}`,
      });
      await loadPlays(session.id);
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent typed foul ─────────────────────────────────

  async function recordOpponentFoul(
    type: "foul_def" | "foul_of" | "foul_tec" | "foul_anti"
  ): Promise<void> {
    if (!session || recording) return;
    setRecording(true);
    try {
      const foulDesc = type === "foul_def" ? "Falta defensiva" : type === "foul_of" ? "Falta ofensiva" : type === "foul_tec" ? "Falta técnica" : "Falta antidesportiva";
      await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      type,
        p_period:          session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_is_home_team:    false,
        p_points_delta:    0,
        p_game_clock:      formatClock(clockSecs),
        p_description:     `Adversário · ${foulDesc}`,
      });
      await loadPlays(session.id);
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent rebounds (typed) ───────────────────────────

  async function recordOpponentReb(type: "reb_off" | "reb_def"): Promise<void> {
    if (!session || recording) return;
    setRecording(true);
    try {
      await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      type === "reb_off" ? "rebound_off" : "rebound_def",
        p_period:          session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_is_home_team:    false,
        p_points_delta:    0,
        p_game_clock:      formatClock(clockSecs),
        p_description:     `Adversário · ${type === "reb_off" ? "Ressalto ofensivo" : "Ressalto defensivo"}`,
      });
      await loadPlays(session.id);
    } finally {
      setRecording(false);
    }
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

  // ── Set lineup (replaces on-court, managing stints) ─────

  async function setLineup(userIds: string[]): Promise<boolean> {
    if (!session) {
      toast({ title: "Erro", description: "Sessão de jogo não encontrada.", variant: "destructive" });
      return false;
    }
    const newIds = userIds.slice(0, 5);
    const goingOff = onCourtIds.filter((id) => !newIds.includes(id));
    const comingOn  = newIds.filter((id) => !onCourtIds.includes(id));

    if (goingOff.length > 0) {
      await supabase.from("player_court_stints")
        .update({
          exit_clock_secs:  Math.round(clockSecs),
          exit_home_score:  session.home_score,
          exit_away_score:  session.away_score,
        })
        .eq("game_session_id", session.id)
        .in("player_id", goingOff)
        .is("exit_clock_secs", null);
    }

    if (comingOn.length > 0) {
      await supabase.from("player_court_stints").insert(
        comingOn.map((pid) => ({
          game_session_id:    session.id,
          player_id:          pid,
          period:             session.current_period,
          entry_clock_secs:   Math.round(clockSecs),
          entry_home_score:   session.home_score,
          entry_away_score:   session.away_score,
        }))
      );
    }

    const { error } = await supabase.from("game_current_lineup").upsert(
      { game_session_id: session.id, on_court_ids: newIds, updated_at: new Date().toISOString() },
      { onConflict: "game_session_id" }
    );

    if (error) {
      toast({ title: "Erro ao definir 5", description: error.message, variant: "destructive" });
      return false;
    }

    setOnCourtIds(newIds);
    toast({ title: "5 em campo atualizado!" });
    return true;
  }

  // ── Timeout ─────────────────────────────────────────────

  async function callTimeout(team: "home" | "away"): Promise<void> {
    if (!session || recording) return;
    setRecording(true);
    try {
      const { error } = await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      "timeout",
        p_period:          session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_is_home_team:    team === "home",
        p_points_delta:    0,
        p_game_clock:      formatClock(clockSecs),
        p_description:     `Timeout ${team === "home" ? "CD Póvoa" : "Adversário"}`,
      });
      if (!error) {
        await loadPlays(session.id);
        toast({ title: `Timeout ${team === "home" ? "CD Póvoa" : "Adversário"}` });
      }
    } finally {
      setRecording(false);
    }
  }

  // ── Undo specific play ──────────────────────────────────

  async function undoPlay(playId: string): Promise<boolean> {
    if (!session || recording) return false;
    const play = plays.find((p) => p.id === playId);
    if (!play) return false;

    const UNUNDOABLE = ["game_start", "period_end", "game_end", "substitution_in"];
    if (UNUNDOABLE.includes(play.event_type)) {
      toast({ title: "Esta ação não pode ser anulada", variant: "destructive" });
      return false;
    }

    setRecording(true);
    try {
      const { error } = await supabase.rpc("undo_play", { p_play_id: playId });
      if (error) {
        toast({ title: "Erro ao anular jogada", description: error.message, variant: "destructive" });
        return false;
      }
      await Promise.all([loadPlays(session.id), loadPlayerStats(session.id), loadSession()]);
      toast({ title: "Jogada anulada" });
      return true;
    } catch (e) {
      console.error("[undoPlay]", e);
      toast({ title: "Erro ao anular jogada", variant: "destructive" });
      return false;
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

    // Close all open stints (usar o relógio real, não 0)
    await supabase.from("player_court_stints")
      .update({ exit_clock_secs: Math.round(clockSecs), exit_home_score: session.home_score, exit_away_score: session.away_score })
      .eq("game_session_id", session.id)
      .is("exit_clock_secs", null);

    await supabase.from("game_sessions").update({
      current_period: nextP,
      clock_running: false,
      clock_elapsed_secs: 0,
      clock_started_at: null,
      away_fouls: 0,
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

    setSession((s) => s ? { ...s, current_period: nextP, clock_running: false, clock_elapsed_secs: 0, clock_started_at: null, away_fouls: 0 } : s);
    setClockSecs(session.period_duration_secs ?? 600);
    await Promise.all([loadPeriodScores(session.id), loadPlays(session.id)]);
  }

  // ── Finish game ─────────────────────────────────────────

  async function finishGame(): Promise<boolean> {
    if (!session) return false;

    if (session.clock_running) await stopClock();

    // Gravar o acumulado do último período (antes só o nextPeriod gravava — faltava o P4) (STA-08)
    await supabase.from("game_period_scores").upsert(
      { game_session_id: session.id, period: session.current_period, home_score: session.home_score, away_score: session.away_score },
      { onConflict: "game_session_id,period" }
    );

    await supabase.from("player_court_stints")
      .update({ exit_clock_secs: Math.round(clockSecs), exit_home_score: session.home_score, exit_away_score: session.away_score })
      .eq("game_session_id", session.id)
      .is("exit_clock_secs", null);

    // Update seconds_played for each player from stints
    const { data: stints } = await supabase
      .from("player_court_stints")
      .select("player_id, entry_clock_secs, exit_clock_secs, entry_home_score, entry_away_score, exit_home_score, exit_away_score")
      .eq("game_session_id", session.id);

    if (stints && stints.length > 0) {
      const secsMap: Record<string, number> = {};
      const pmMap: Record<string, number> = {};
      for (const stint of stints) {
        const secs = Math.max(0, stint.entry_clock_secs - (stint.exit_clock_secs ?? 0));
        secsMap[stint.player_id] = (secsMap[stint.player_id] ?? 0) + secs;
        const exitHome = (stint.exit_home_score as number | null) ?? session.home_score;
        const exitAway = (stint.exit_away_score as number | null) ?? session.away_score;
        const entryHome = (stint.entry_home_score as number | null) ?? 0;
        const entryAway = (stint.entry_away_score as number | null) ?? 0;
        pmMap[stint.player_id] = (pmMap[stint.player_id] ?? 0) + (exitHome - exitAway) - (entryHome - entryAway);
      }
      await Promise.all(
        Object.keys(secsMap).map((pid) =>
          supabase.from("player_game_stats")
            .update({
              seconds_played: Math.round(secsMap[pid]),
              plus_minus: Math.round(pmMap[pid] ?? 0),
              updated_at: new Date().toISOString(),
            })
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
    recordOpponentFoul, recordOpponentReb,
    substitutePlayer, setLineup, callTimeout, undoPlay,
    nextPeriod, finishGame,
  };
}
