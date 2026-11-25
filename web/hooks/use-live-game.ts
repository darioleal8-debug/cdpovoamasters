"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast as baseToast } from "@/components/ui/toaster";
import { liveNotice, PLAY_LABEL } from "@/lib/live/notice";

// Every live message also shows as a soft in-container notice (visible in full screen);
// errors additionally keep the persistent toast.
function toast(opts: { title: string; description?: string; variant?: "default" | "destructive" }) {
  const text = opts.description && opts.variant !== "destructive" ? `${opts.title} — ${opts.description}` : opts.title;
  liveNotice(opts.variant === "destructive" ? `${opts.title}${opts.description ? ` — ${opts.description}` : ""}` : text, opts.variant === "destructive" ? "error" : "ok");
  if (opts.variant === "destructive") baseToast(opts as never);
}
import type {
  GameSession, PlayByPlay, PlayerGameStats,
  PlayerGameStatsWithUser, GamePeriodScore, PlayEventType,
} from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import type { CourtStint } from "@/lib/live/minutes";
import { isShotEvent, isMadeShot, shotKindOf, classifyShotZone, resolveShotSpot, SHOT_SPOT_MESSAGES, FREE_THROW_POINT, BLOCKED_DESC } from "@/lib/live/shot-zones";
import { useClubName } from "@/lib/club-context";
import { operatingSeasonId } from "@/lib/club/operating-season";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Device clock minus server clock (ms), measured when the scorer starts/stops the clock. Only set when the skew is large. */
let clockOffsetMs = 0;

export function computeClockSecs(session: GameSession | null): number {
  if (!session) return DEFAULT_PERIOD_SECS;
  let elapsed = session.clock_elapsed_secs ?? 0;
  if (session.clock_running && session.clock_started_at) {
    elapsed += (Date.now() + clockOffsetMs - new Date(session.clock_started_at).getTime()) / 1000;
  }
  return Math.max(0, (session.period_duration_secs ?? DEFAULT_PERIOD_SECS) - elapsed);
}

/** Duração por defeito de cada período: 8 minutos (Liga INATEL). */
export const DEFAULT_PERIOD_SECS = 8 * 60;

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
  const clubName = useClubName();
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [roster, setRoster] = useState<PlayerWithUser[]>([]);
  const [onCourtIds, setOnCourtIds] = useState<string[]>([]);
  const [plays, setPlays] = useState<PlayByPlay[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerGameStatsWithUser[]>([]);
  const [periodScores, setPeriodScores] = useState<GamePeriodScore[]>([]);
  const [stints, setStints] = useState<CourtStint[]>([]);
  const [clockSecs, setClockSecs] = useState(DEFAULT_PERIOD_SECS);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const sessionRef = useRef<GameSession | null>(null);
  const myClubIdsRef = useRef<string[] | null>(null);
  sessionRef.current = session;
  /** Shot waiting for the scorer to pick the court zone (and the assist on made 2PT/3PT). */
  const [pendingShot, setPendingShot] = useState<{ event_type: PlayEventType; player_id: string; opponent?: boolean; clock_secs?: number; game_clock?: string } | null>(null);
  /** Jogo terminado → nenhuma estatística pode ser alterada. */
  const locked = () => {
    if (sessionRef.current?.status === "live") return false;
    toast({ title: "Game finished", description: "Stats can no longer be changed.", variant: "destructive" });
    return true;
  };

  // ── Season — derivada do evento, não da temporada activa ─
  useEffect(() => {
    supabase.from("events").select("season_id").eq("id", eventId).single()
      .then(async ({ data }) => {
        if (!data?.season_id) return;
        // Jogos da Liga têm a época do CD Póvoa: cada clube opera sobre o seu próprio plantel
        const sid = await operatingSeasonId(supabase, data.season_id as string);
        if (sid) setSeasonId(sid);
      });
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
      .is("deleted_at", null) // undone plays must disappear from the log, shot chart and stats
      .order("created_at", { ascending: false })
      .limit(2000);
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

  const loadStints = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("player_court_stints")
      .select("player_id, period, entry_clock_secs, exit_clock_secs")
      .eq("game_session_id", sessionId);
    if (data) setStints(data as CourtStint[]);
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
    // Several clubs can score the same league game (one session per club): take this club's own.
    const { data: rows } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (!myClubIdsRef.current) {
      const { data: ids } = await supabase.rpc("my_club_ids");
      myClubIdsRef.current = (Array.isArray(ids) ? ids : []) as string[];
    }
    const mine = myClubIdsRef.current;
    const list = (rows ?? []) as GameSession[];
    const data =
      list.find((r) => (r as { club_id?: string | null }).club_id && mine.includes((r as { club_id?: string | null }).club_id as string)) ??
      list.find((r) => !(r as { club_id?: string | null }).club_id) ??
      (mine.length === 0 ? list[0] : undefined) ??
      null;
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
        loadStints(sess.id),
      ]);
    }
    setLoading(false);
  }, [loadSession, loadRoster, loadPlays, loadPlayerStats, loadPeriodScores, loadLineup, loadStints]);

  useEffect(() => {
    if (seasonId) loadAll(seasonId);
  }, [seasonId, loadAll]);

  // ── Client-side clock tick ──────────────────────────────
  const autoStopped = useRef(false);
  useEffect(() => {
    if (!session?.clock_running || opts.realtimeOnly) return;
    autoStopped.current = false;
    const interval = setInterval(() => {
      const secs = computeClockSecs(sessionRef.current);
      setClockSecs(secs);
      // The period is over: stop the clock by itself so the end-of-period flow can start.
      if (secs <= 0 && !autoStopped.current) {
        autoStopped.current = true;
        void stopClock().then(() => liveNotice("⏱ 00:00 — clock stopped", "info"));
      }
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
        () => { loadPlayerStats(session.id); loadStints(session.id); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_current_lineup", filter: `game_session_id=eq.${session.id}` },
        (payload) => { setOnCourtIds((payload.new as { on_court_ids: string[] }).on_court_ids ?? []); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  // ── Rede de segurança: o Realtime nem sempre entrega (rede do pavilhão).
  // Enquanto o jogo está ao vivo, relê a sessão (marcador/relógio) a cada 4s.
  useEffect(() => {
    if (!session?.id || session.status !== "live") return;
    const sid = session.id;
    let n = 0;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadSession();
      if (n++ % 2 === 0) loadStints(sid); // tempo jogado (substituições)
    };
    const id = window.setInterval(tick, 4000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [session?.id, session?.status, loadSession, loadStints]);

  // ── Clock controls ──────────────────────────────────────

  // As ações do relógio atualizam o estado local de imediato (otimista) e
  // depois com a linha devolvida pela base de dados — não dependem do eco do
  // Realtime, que pode falhar/atrasar (rede fraca no pavilhão, websocket em
  // baixo). Usam sessionRef para nunca agir sobre um estado desatualizado.
  async function writeClock(
    patch: Partial<GameSession>,
    rollback: GameSession
  ): Promise<void> {
    setSession((s) => (s ? { ...s, ...patch } : s));
    const { data, error } = await supabase
      .from("game_sessions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", rollback.id)
      .select("*")
      .single();
    if (error || !data) {
      setSession(rollback);
      toast({ title: "Clock not updated", description: error?.message ?? "Please try again.", variant: "destructive" });
      // repõe o estado real a partir da BD
      loadSession();
      return;
    }
    setSession(data as GameSession);
  }

  function isMissingFn(error: { code?: string; message?: string }): boolean {
    return error.code === "PGRST202" || error.code === "42883" || /Could not find the function|does not exist/i.test(error.message ?? "");
  }

  /** Start/stop the clock on the server (uses the database clock, so devices with a wrong time stay in sync).
   *  Returns null when the functions are not installed yet, so callers fall back to the client-side update. */
  async function clockViaRpc(fn: "live_start_clock" | "live_stop_clock", optimistic: Partial<GameSession>, rollback: GameSession): Promise<boolean | null> {
    setSession((s) => (s ? { ...s, ...optimistic } : s));
    const { data, error } = await supabase.rpc(fn, { p_session_id: rollback.id });
    if (error) {
      setSession(rollback);
      if (isMissingFn(error)) return null;
      toast({ title: "Clock not updated", description: error.message, variant: "destructive" });
      loadSession();
      return false;
    }
    const row = data as GameSession | null;
    if (row?.id) {
      if (row.updated_at) {
        const off = Date.now() - new Date(row.updated_at).getTime();
        clockOffsetMs = Math.abs(off) > 2000 ? -off : 0;
      }
      setSession(row);
    }
    return true;
  }

  async function startClock(): Promise<void> {
    if (sessionRef.current && sessionRef.current.status !== "live") return;
    const cur = sessionRef.current;
    if (!cur || cur.clock_running) return;
    const viaRpc = await clockViaRpc("live_start_clock", { clock_running: true, clock_started_at: new Date().toISOString() }, cur);
    if (viaRpc !== null) { if (viaRpc) liveNotice("▶ Clock started", "info"); return; }
    await writeClock(
      { clock_running: true, clock_started_at: new Date().toISOString() },
      cur
    );
    liveNotice("▶ Clock started", "info");
  }

  async function stopClock(): Promise<void> {
    if (sessionRef.current && sessionRef.current.status !== "live") return;
    const cur = sessionRef.current;
    if (!cur || !cur.clock_running) return;
    const started = cur.clock_started_at ? new Date(cur.clock_started_at).getTime() : Date.now();
    const elapsed = (cur.clock_elapsed_secs ?? 0) + (Date.now() - started) / 1000;
    const maxSecs = cur.period_duration_secs ?? DEFAULT_PERIOD_SECS;
    const stopped = { clock_running: false, clock_elapsed_secs: Math.min(maxSecs, Math.round(elapsed)), clock_started_at: null };
    const viaRpc = await clockViaRpc("live_stop_clock", stopped, cur);
    if (viaRpc === null) await writeClock(stopped, cur);
    else if (!viaRpc) return;
    liveNotice("⏸ Clock stopped", "info");
  }

  async function resetClock(): Promise<void> {
    if (sessionRef.current && sessionRef.current.status !== "live") return;
    const cur = sessionRef.current;
    if (!cur) return;
    await writeClock(
      { clock_running: false, clock_elapsed_secs: 0, clock_started_at: null },
      cur
    );
    setClockSecs(cur.period_duration_secs ?? DEFAULT_PERIOD_SECS);
  }

  // ── Start game ──────────────────────────────────────────

  async function startGame(
    opponentName: string,
    startingFiveIds: string[],
    callupPlayerIds?: string[],
    periodDurationSecs: number = DEFAULT_PERIOD_SECS
  ): Promise<boolean> {
    if (!seasonId) return false;
    setRecording(true);
    try {
      let rosterToUse = roster;
      if (callupPlayerIds && callupPlayerIds.length > 0) {
        const { error: callupErr } = await supabase.from("game_callups").insert(
          callupPlayerIds.map((pid) => ({ game_id: eventId, player_id: pid }))
        );
        if (callupErr) {
          toast({ title: "Could not save the call-up", description: callupErr.message, variant: "destructive" });
          return false;
        }
        rosterToUse = await loadRoster(seasonId);
      }
      const { data, error } = await supabase
        .from("game_sessions")
        .insert({
          event_id: eventId,
          season_id: seasonId,
          opponent_name: opponentName || "Opponent",
          status: "live",
          started_at: new Date().toISOString(),
          period_duration_secs: Math.round(periodDurationSecs),
        })
        .select()
        .single();

      if (error) {
        toast({ title: "Could not start the game", description: error.message, variant: "destructive" });
        return false;
      }

      const initResults = await Promise.all([
        supabase.from("play_by_play").insert({
          game_session_id: data.id,
          season_id: seasonId,
          period: 1,
          event_type: "game_start",
          is_home_team: true,
          points_delta: 0,
          home_score_after: 0,
          away_score_after: 0,
          description: "Game start",
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

      let initError = initResults.map((r) => (r as { error?: { message: string } | null }).error).find(Boolean) ?? null;

      // Open stints for starting 5
      if (!initError && startingFiveIds.length > 0) {
        const { error: stintErr } = await supabase.from("player_court_stints").insert(
          startingFiveIds.slice(0, 5).map((pid) => ({
            game_session_id: data.id,
            player_id: pid,
            period: 1,
            entry_clock_secs: data.period_duration_secs ?? DEFAULT_PERIOD_SECS,
            entry_home_score: 0,
            entry_away_score: 0,
          }))
        );
        initError = stintErr;
      }

      if (initError) {
        // Do not leave a half-initialised live session behind: remove it so the game can be started again.
        for (const table of ["play_by_play", "player_game_stats", "game_current_lineup", "player_court_stints", "game_period_scores"]) {
          await supabase.from(table).delete().eq("game_session_id", data.id);
        }
        await supabase.from("game_sessions").delete().eq("id", data.id);
        toast({ title: "Could not start the game", description: initError.message, variant: "destructive" });
        return false;
      }

      setSession(data as GameSession);
      setOnCourtIds(startingFiveIds.slice(0, 5));
      await Promise.all([loadPlays(data.id), loadPlayerStats(data.id)]);
      toast({ title: "🏀 Game started!" });
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Record event ────────────────────────────────────────

  // Stable client ids: a retry of the same action (e.g. after a lost response) reuses the same id, so
  // record_play ignores the duplicate instead of logging the play twice.
  const clientIds = useRef(new Map<string, string>());
  function clientIdFor(sig: string): string | null {
    if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") return null;
    let id = clientIds.current.get(sig);
    if (!id) { id = crypto.randomUUID(); clientIds.current.set(sig, id); }
    return id;
  }
  function clientIdDone(sig: string) { clientIds.current.delete(sig); }

  /** A tap that arrives while the previous action is still saving is not silently dropped. */
  function busy(): false {
    liveNotice("⏳ Still saving the previous action — tap again", "error");
    return false;
  }

  function playError(message: string): string {
    return message.includes("shot_spot_mismatch")
      ? "The shot spot does not match the shot type (3PT behind the line, 2PT inside it)."
      : message;
  }

  /** Validates the spot of a 2PT / 3PT before saving (the court UI already blocks it; this is the safety net). */
  function spotError(kind: ReturnType<typeof shotKindOf>, spot: { x: number; y: number } | null): string | null {
    if (kind !== "2" && kind !== "3") return null;
    if (!spot) return "Pick the shot location on the court.";
    const check = resolveShotSpot(kind, spot.x, spot.y);
    if (!check.ok) return SHOT_SPOT_MESSAGES[check.reason];
    if (check.snapped) return SHOT_SPOT_MESSAGES[kind === "3" ? "inside_three_line" : "outside_two_area"];
    return null;
  }

  /**
   * Public entry point used by every live layout. Shots (2PT / 3PT / FT, made or
   * missed) are not saved straight away: the scorer first picks the court zone
   * and, for made 2PT/3PT, who assisted (see ShotFlow). Everything else is saved at once.
   * The game clock is captured when the scorer taps, not when the dialog is confirmed.
   */
  async function recordPlay(input: {
    event_type: PlayEventType;
    player_id?: string;
    secondary_player_id?: string;
    game_clock?: string;
    description?: string;
  }): Promise<boolean> {
    if (locked()) return false;
    if (!session) return false;
    if (recording) return busy();
    if (isShotEvent(input.event_type) && input.player_id) {
      setPendingShot({
        event_type: input.event_type, player_id: input.player_id,
        clock_secs: Math.round(clockSecs), game_clock: formatClock(clockSecs),
      });
      return true;
    }
    return recordPlayNow(input);
  }

  /** Called by ShotFlow once the scorer has chosen a valid zone and the assist. */
  async function confirmShot(
    spot: { x: number; y: number } | null,
    assistPlayerId: string | null,
    blocked?: boolean
  ): Promise<boolean> {
    const shot = pendingShot;
    if (!shot) return false;
    const kind = shotKindOf(shot.event_type);
    const problem = spotError(kind, spot);
    if (problem) {
      toast({ title: "Shot not saved", description: problem, variant: "destructive" });
      return false;
    }
    const at = shot.clock_secs !== undefined ? { clock_secs: shot.clock_secs, game_clock: shot.game_clock ?? formatClock(shot.clock_secs) } : undefined;
    if (shot.opponent) {
      const done = await recordOpponentShotNow(shot.event_type, spot, at);
      if (done) setPendingShot(null);
      return done;
    }
    const point = kind === "ft" ? (spot ?? FREE_THROW_POINT) : spot;
    const ok = await recordPlayNow({
      event_type: shot.event_type,
      player_id: shot.player_id,
      secondary_player_id: isMadeShot(shot.event_type) && kind !== "ft" ? (assistPlayerId ?? undefined) : undefined,
      shot_x: point?.x,
      shot_y: point?.y,
      shot_zone: kind === "ft" ? "free_throw" : point ? classifyShotZone(point.x, point.y) : undefined,
      description: blocked && !isMadeShot(shot.event_type) && kind !== "ft" ? BLOCKED_DESC : undefined,
      clock_secs: at?.clock_secs,
      game_clock: at?.game_clock,
    });
    if (ok) setPendingShot(null);
    return ok;
  }

  function cancelShot() { setPendingShot(null); }

  async function recordPlayNow(input: {
    event_type: PlayEventType;
    player_id?: string;
    secondary_player_id?: string;
    game_clock?: string;
    description?: string;
    shot_x?: number;
    shot_y?: number;
    shot_zone?: string;
    clock_secs?: number;
  }): Promise<boolean> {
    if (locked()) return false;
    if (!session) return false;
    if (recording) return busy();
    const secs = input.clock_secs ?? Math.round(clockSecs);
    const sig = `${input.event_type}|${input.player_id ?? ""}|${input.secondary_player_id ?? ""}|${input.shot_x ?? ""}|${input.shot_y ?? ""}|${input.description ?? ""}`;
    setRecording(true);
    try {
      const { error } = await supabase.rpc("record_play", {
        p_game_session_id:     session.id,
        p_event_type:          input.event_type,
        p_period:              session.current_period,
        p_clock_time_secs:     secs,
        p_is_home_team:        true,
        p_points_delta:        POINTS_MAP[input.event_type] ?? 0,
        p_player_id:           input.player_id ?? null,
        p_secondary_player_id: input.secondary_player_id ?? null,
        p_game_clock:          input.game_clock ?? formatClock(secs),
        p_shot_x:              input.shot_x ?? null,
        p_shot_y:              input.shot_y ?? null,
        p_shot_zone:           input.shot_zone ?? null,
        p_description:         input.description ?? null,
        p_client_id:           clientIdFor(sig),
      });

      if (error) {
        toast({ title: "Error", description: playError(error.message), variant: "destructive" });
        return false;
      }
      clientIdDone(sig);

      await Promise.all([loadPlays(session.id), loadPlayerStats(session.id), loadSession()]);
      const who = roster.find((p) => p.user_id === input.player_id);
      const ast = input.secondary_player_id ? roster.find((p) => p.user_id === input.secondary_player_id) : null;
      liveNotice(
        `✓ ${who ? `#${who.jersey_number} ${who.user.name.split(" ")[0]} · ` : ""}${PLAY_LABEL[input.event_type] ?? input.event_type}` +
        (input.description === BLOCKED_DESC ? " · blocked" : "") +
        (ast ? ` · ast #${ast.jersey_number} ${ast.user.name.split(" ")[0]}` : isMadeShot(input.event_type) && shotKindOf(input.event_type) !== "ft" ? " · no assist" : ""),
      );
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent points ─────────────────────────────────────

  const OPP_SHOT_TYPES: Record<"made" | "miss", Record<1 | 2 | 3, PlayEventType>> = {
    made: { 1: "ft_made", 2: "2pt_made", 3: "3pt_made" },
    miss: { 1: "ft_miss", 2: "2pt_miss", 3: "3pt_miss" },
  };

  /** Opponent shot (2PT / 3PT / FT, made or missed). Free throws are saved at once (fixed spot);
   *  2PT / 3PT first ask the court zone through ShotFlow. */
  async function startOpponentShot(pts: 1 | 2 | 3, result: "made" | "miss"): Promise<void> {
    if (locked()) return;
    if (!session) return;
    if (recording) { busy(); return; }
    const event_type = OPP_SHOT_TYPES[result][pts];
    const at = { clock_secs: Math.round(clockSecs), game_clock: formatClock(clockSecs) };
    if (pts === 1) {
      await recordOpponentShotNow(event_type, null, at);
      return;
    }
    setPendingShot({ event_type, player_id: "", opponent: true, ...at });
  }

  async function recordOpponentPoints(pts: number): Promise<void> {
    await startOpponentShot(pts === 1 ? 1 : pts === 3 ? 3 : 2, "made");
  }

  async function recordOpponentMiss(pts: number): Promise<void> {
    await startOpponentShot(pts === 1 ? 1 : pts === 3 ? 3 : 2, "miss");
  }

  async function recordOpponentShotNow(
    eventType: PlayEventType,
    spot: { x: number; y: number } | null,
    at?: { clock_secs: number; game_clock: string }
  ): Promise<boolean> {
    if (locked()) return false;
    if (!session) return false;
    if (recording) return busy();
    const kind = shotKindOf(eventType);
    const problem = spotError(kind, spot);
    if (problem) {
      toast({ title: "Shot not saved", description: problem, variant: "destructive" });
      return false;
    }
    const made = isMadeShot(eventType);
    const pts = kind === "3" ? 3 : kind === "2" ? 2 : 1;
    const point = kind === "ft" ? FREE_THROW_POINT : spot;
    const label = made ? `Opponent +${pts}` : `Opponent ${kind === "ft" ? "FT" : `${pts}PT`} missed`;
    const secs = at?.clock_secs ?? Math.round(clockSecs);
    const sig = `opp|${eventType}|${point?.x ?? ""}|${point?.y ?? ""}`;
    setRecording(true);
    try {
      const { error: oppErr } = await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      eventType,
        p_period:          session.current_period,
        p_clock_time_secs: secs,
        p_is_home_team:    false,
        p_points_delta:    made ? pts : 0,
        p_game_clock:      at?.game_clock ?? formatClock(secs),
        p_shot_x:          point?.x ?? null,
        p_shot_y:          point?.y ?? null,
        p_shot_zone:       kind === "ft" ? "free_throw" : point ? classifyShotZone(point.x, point.y) : null,
        p_description:     label,
        p_client_id:       clientIdFor(sig),
      });
      if (oppErr) { toast({ title: "Error", description: playError(oppErr.message), variant: "destructive" }); return false; }
      clientIdDone(sig);
      await Promise.all([loadPlays(session.id), loadSession()]);
      liveNotice(`✓ ${label}`);
      return true;
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent typed foul ─────────────────────────────────

  async function recordOpponentFoul(
    type: "foul_def" | "foul_of" | "foul_tec" | "foul_anti"
  ): Promise<void> {
    if (locked()) return;
    if (!session) return;
    if (recording) { busy(); return; }
    setRecording(true);
    try {
      const foulDesc = type === "foul_def" ? "Defensive foul" : type === "foul_of" ? "Offensive foul" : type === "foul_tec" ? "Technical foul" : "Unsportsmanlike foul";
      const { error: foulErr } = await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      type,
        p_period:          session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_is_home_team:    false,
        p_points_delta:    0,
        p_game_clock:      formatClock(clockSecs),
        p_description:     `Opponent · ${foulDesc}`,
        p_client_id:       clientIdFor(`opp-foul:${type}`),
      });
      if (foulErr) { toast({ title: "Error", description: foulErr.message, variant: "destructive" }); return; }
      clientIdDone(`opp-foul:${type}`);
      await Promise.all([loadPlays(session.id), loadSession()]);
      liveNotice(`✓ Opponent · ${foulDesc}`);
    } finally {
      setRecording(false);
    }
  }

  // ── Opponent rebounds (typed) ───────────────────────────

  async function recordOpponentReb(type: "reb_off" | "reb_def"): Promise<void> {
    if (locked()) return;
    if (!session) return;
    if (recording) { busy(); return; }
    setRecording(true);
    try {
      const { error: rebErr } = await supabase.rpc("record_play", {
        p_game_session_id: session.id,
        p_event_type:      type === "reb_off" ? "rebound_off" : "rebound_def",
        p_period:          session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_is_home_team:    false,
        p_points_delta:    0,
        p_game_clock:      formatClock(clockSecs),
        p_description:     `Opponent · ${type === "reb_off" ? "Offensive rebound" : "Defensive rebound"}`,
        p_client_id:       clientIdFor(`opp-reb:${type}`),
      });
      if (rebErr) { toast({ title: "Error", description: rebErr.message, variant: "destructive" }); return; }
      clientIdDone(`opp-reb:${type}`);
      await Promise.all([loadPlays(session.id), loadSession()]);
      liveNotice(`✓ Opponent · ${type === "reb_off" ? "Offensive rebound" : "Defensive rebound"}`);
    } finally {
      setRecording(false);
    }
  }

  // ── Substitution ────────────────────────────────────────

  /** Atomic substitution (one database transaction). Falls back to the step-by-step version if the
   *  substitute_player function is not installed yet. Ignores taps while another action is saving. */
  async function substitutePlayer(inId: string, outId: string): Promise<void> {
    if (locked()) return;
    if (!session) return;
    if (recording) { busy(); return; }
    setRecording(true);
    try {
      const pIn = roster.find((p) => p.user_id === inId);
      const pOut = roster.find((p) => p.user_id === outId);
      const { error } = await supabase.rpc("substitute_player", {
        p_game_session_id: session.id,
        p_in: inId,
        p_out: outId,
        p_period: session.current_period,
        p_clock_time_secs: Math.round(clockSecs),
        p_game_clock: formatClock(clockSecs),
        p_description: `Sub: in #${pIn?.jersey_number} out #${pOut?.jersey_number}`,
      });
      if (!error) {
        setOnCourtIds(onCourtIds.filter((id) => id !== outId).concat(inId));
        await Promise.all([loadPlays(session.id), loadSession(), loadStints(session.id), loadLineup(session.id)]);
        liveNotice(`↔ Sub · #${pIn?.jersey_number} ${pIn?.user.name.split(" ")[0] ?? ""} in, #${pOut?.jersey_number} ${pOut?.user.name.split(" ")[0] ?? ""} out`);
        return;
      }
      if (!isMissingFn(error)) {
        toast({ title: "Substitution not saved", description: error.message, variant: "destructive" });
        await loadLineup(session.id);
        return;
      }
    } finally {
      setRecording(false);
    }
    await substituteLegacy(inId, outId);
  }

  async function substituteLegacy(inId: string, outId: string): Promise<void> {
    if (locked()) return;
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
      description: `Sub: in #${roster.find((p) => p.user_id === inId)?.jersey_number} out #${roster.find((p) => p.user_id === outId)?.jersey_number}`,
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
    await Promise.all([loadPlays(session.id), loadSession(), loadStints(session.id)]);
    const pIn = roster.find((p) => p.user_id === inId);
    const pOut = roster.find((p) => p.user_id === outId);
    liveNotice(`↔ Sub · #${pIn?.jersey_number} ${pIn?.user.name.split(" ")[0] ?? ""} in, #${pOut?.jersey_number} ${pOut?.user.name.split(" ")[0] ?? ""} out`);
  }

  // ── Set lineup (replaces on-court, managing stints) ─────

  async function setLineup(userIds: string[]): Promise<boolean> {
    if (locked()) return false;
    if (!session) {
      toast({ title: "Error", description: "Game session not found.", variant: "destructive" });
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
      toast({ title: "Could not set the lineup", description: error.message, variant: "destructive" });
      return false;
    }

    setOnCourtIds(newIds);
    loadStints(session.id);
    toast({ title: "Lineup updated!" });
    return true;
  }

  // ── Timeout ─────────────────────────────────────────────

  async function callTimeout(team: "home" | "away"): Promise<void> {
    if (locked()) return;
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
        p_description:     `Timeout ${team === "home" ? clubName : "Opponent"}`,
      });
      if (!error) {
        await Promise.all([loadPlays(session.id), loadSession()]);
        toast({ title: `Timeout ${team === "home" ? clubName : "Opponent"}` });
      }
    } finally {
      setRecording(false);
    }
  }

  // ── Undo specific play (any action) ─────────────────────
  // Stat plays: soft-deleted by the undo_play RPC (reverses score/stats/assists).
  // Structural plays (substitutions, period end, game end, game start) also restore the state they changed.

  async function undoPlay(playId: string): Promise<boolean> {
    if (!session || recording) return false;
    const play = plays.find((p) => p.id === playId);
    if (!play) return false;
    const type = play.event_type as string;

    // Everything except re-opening a finished game needs a live game
    if (type !== "game_end" && locked()) return false;

    const later = plays.filter((p) => p.id !== play.id && String(p.created_at) > String(play.created_at));
    const fail = (title: string) => { toast({ title, variant: "destructive" }); return false; };

    if (type === "game_end") {
      if (session.status !== "finished") return fail("The game is not finished");
      if (later.length > 0) return fail("Undo the later actions first");
    }
    if (type === "period_end") {
      if (later.length > 0) return fail("Undo the later actions first");
      if (session.current_period !== play.period + 1) return fail("This period end can no longer be undone");
    }
    if (type === "game_start" && plays.length > 1) {
      return fail("Undo all the other actions before undoing the game start");
    }

    setRecording(true);
    try {
      if (type === "game_start") {
        // Nothing else was logged: wipe the session so the game can be started again
        const sid = session.id;
        for (const table of ["play_by_play", "player_game_stats", "game_current_lineup", "player_court_stints", "game_period_scores"]) {
          const { error } = await supabase.from(table).delete().eq("game_session_id", sid);
          if (error) { toast({ title: "Could not undo the game start", description: error.message, variant: "destructive" }); return false; }
        }
        const { error } = await supabase.from("game_sessions").delete().eq("id", sid);
        if (error) { toast({ title: "Could not undo the game start", description: error.message, variant: "destructive" }); return false; }
        setSession(null);
        setPlays([]);
        setOnCourtIds([]);
        toast({ title: "Game start undone" });
        return true;
      }

      const { error } = await supabase.rpc("undo_play", { p_play_id: playId });
      if (error) {
        toast({ title: "Could not undo the play", description: error.message, variant: "destructive" });
        return false;
      }

      if (type === "substitution_in" && play.player_id && play.secondary_player_id) {
        const inId = play.player_id as string;
        const outId = play.secondary_player_id as string;
        if (onCourtIds.includes(inId) && !onCourtIds.includes(outId)) {
          const newLineup = onCourtIds.filter((id) => id !== inId).concat(outId);
          await supabase.from("game_current_lineup").upsert(
            { game_session_id: session.id, on_court_ids: newLineup, updated_at: new Date().toISOString() },
            { onConflict: "game_session_id" }
          );
          await supabase.from("player_court_stints").delete()
            .eq("game_session_id", session.id).eq("player_id", inId)
            .eq("period", play.period).eq("entry_clock_secs", play.clock_time_secs ?? 0);
          await supabase.from("player_court_stints")
            .update({ exit_clock_secs: null, exit_home_score: null, exit_away_score: null })
            .eq("game_session_id", session.id).eq("player_id", outId)
            .eq("period", play.period).eq("exit_clock_secs", play.clock_time_secs ?? 0);
          setOnCourtIds(newLineup);
        } else {
          toast({ title: "Substitution removed from the log", description: "The lineup had already changed, so it was left as it is." });
        }
      }

      if (type === "period_end") {
        const prev = play.period;
        const awayFoulTypes = ["foul_committed", "foul_def", "foul_of", "foul_tec", "foul_anti"];
        const awayFouls = plays.filter((p) => p.id !== play.id && p.period === prev && !p.is_home_team && awayFoulTypes.includes(p.event_type as string)).length;
        await supabase.from("player_court_stints").delete().eq("game_session_id", session.id).eq("period", session.current_period);
        await supabase.from("player_court_stints")
          .update({ exit_clock_secs: null, exit_home_score: null, exit_away_score: null })
          .eq("game_session_id", session.id).eq("period", prev).in("player_id", onCourtIds);
        await supabase.from("game_sessions").update({
          current_period: prev,
          clock_running: false,
          clock_started_at: null,
          clock_elapsed_secs: session.period_duration_secs ?? DEFAULT_PERIOD_SECS, // back to 00:00 of that period
          away_fouls: awayFouls,
          updated_at: new Date().toISOString(),
        }).eq("id", session.id);
        setClockSecs(0);
      }

      if (type === "game_end") {
        await supabase.from("game_sessions").update({
          status: "live", finished_at: null, updated_at: new Date().toISOString(),
        }).eq("id", session.id);
        await supabase.from("player_court_stints")
          .update({ exit_clock_secs: null, exit_home_score: null, exit_away_score: null })
          .eq("game_session_id", session.id).eq("period", session.current_period).in("player_id", onCourtIds);
      }

      await Promise.all([
        loadPlays(session.id), loadPlayerStats(session.id), loadSession(),
        loadStints(session.id), loadPeriodScores(session.id),
      ]);
      toast({ title: type === "game_end" ? "Game re-opened" : "Action undone" });
      return true;
    } catch (e) {
      console.error("[undoPlay]", e);
      toast({ title: "Could not undo the action", variant: "destructive" });
      return false;
    } finally {
      setRecording(false);
    }
  }

  async function nextPeriod(): Promise<void> {
    if (locked()) return;
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
      description: `End of period ${session.current_period}`,
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
          entry_clock_secs: session.period_duration_secs ?? DEFAULT_PERIOD_SECS,
          entry_home_score: session.home_score,
          entry_away_score: session.away_score,
        }))
      );
    }

    setSession((s) => s ? { ...s, current_period: nextP, clock_running: false, clock_elapsed_secs: 0, clock_started_at: null, away_fouls: 0 } : s);
    setClockSecs(session.period_duration_secs ?? DEFAULT_PERIOD_SECS);
    await Promise.all([loadPeriodScores(session.id), loadPlays(session.id), loadStints(session.id)]);
    liveNotice(`→ Period ${nextP} ready`, "info");
  }

  // ── Finish game ─────────────────────────────────────────

  async function finishGame(): Promise<boolean> {
    if (!session || session.status !== "live") return false;

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
      description: `Final — ${clubName} ${session.home_score} vs ${session.away_score} ${session.opponent_name}`,
    });

    const { error: finishErr } = await supabase.from("game_sessions").update({
      status: "finished",
      clock_running: false,
      clock_started_at: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);
    if (finishErr) {
      toast({ title: "Could not finish the game", description: finishErr.message, variant: "destructive" });
      return false;
    }

    setSession((s) => s ? { ...s, status: "finished" } : s);
    toast({ title: "🏁 Game finished!", description: "Stats saved." });
    // Jogos da Liga INATEL: o resultado e as estatísticas live passam a ser os oficiais
    void publishToLeague(session.id, { silentIfNotLeague: true });
    return true;
  }

  // ── Publicar na Liga INATEL ─────────────────────────────
  const [publishing, setPublishing] = useState(false);
  async function publishToLeague(sessionId?: string, opts: { silentIfNotLeague?: boolean } = {}): Promise<boolean> {
    const sid = sessionId ?? sessionRef.current?.id;
    if (!sid) return false;
    setPublishing(true);
    try {
      const res = await fetch(`/api/live/${sid}/publicar-liga`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; homeScore?: number; awayScore?: number; isTest?: boolean };
      if (!res.ok || !j.ok) {
        if (opts.silentIfNotLeague && res.status === 422) return false;
        toast({ title: "Result not published to the League", description: j.error ?? "Please try again.", variant: "destructive" });
        return false;
      }
      toast({
        title: "🏆 Liga INATEL updated",
        description: j.isTest
          ? `Test game ${j.homeScore}–${j.awayScore}: result saved (does not count towards the standings).`
          : `Result ${j.homeScore}–${j.awayScore} and stats published. The news article is being generated.`,
      });
      return true;
    } catch {
      toast({ title: "Result not published to the League", description: "No connection — please try again.", variant: "destructive" });
      return false;
    } finally {
      setPublishing(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────
  const onCourt = roster.filter((p) => onCourtIds.includes(p.user_id));
  const bench = roster.filter((p) => !onCourtIds.includes(p.user_id));

  return {
    seasonId, session, roster, onCourt, bench, onCourtIds,
    plays, playerStats, periodScores, clockSecs, stints,
    loading, recording,
    startGame, startClock, stopClock, resetClock,
    recordPlay, pendingShot, confirmShot, cancelShot, recordOpponentPoints, recordOpponentMiss,
    recordOpponentFoul, recordOpponentReb,
    substitutePlayer, setLineup, callTimeout, undoPlay,
    nextPeriod, finishGame, publishToLeague, publishing,
  };
}
