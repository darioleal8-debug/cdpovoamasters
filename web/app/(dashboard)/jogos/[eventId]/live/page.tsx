"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useClubName, ClubName } from "@/lib/club-context";
import { useParams, useRouter } from "next/navigation";
import { useLiveGame, DEFAULT_PERIOD_SECS } from "@/hooks/use-live-game";
import { useLivePrefs } from "@/hooks/use-live-prefs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createClient } from "@/lib/supabase/client";
import { deriveStats, withSecondsPlayed } from "@/lib/live/derive-stats";
import { computeSecondsPlayed } from "@/lib/live/minutes";
import { LIGHT_TOKENS, DARK_TOKENS, SANS, MONO } from "@/components/live/tokens";
import { LivePrefsBar } from "@/components/live/live-prefs-bar";
import { SummaryOverlay } from "@/components/live/summary-overlay";
import { ShareOverlay } from "@/components/live/share-overlay";
import { Layout1a } from "@/components/live/layout-1a";
import { Layout1b } from "@/components/live/layout-1b";
import { Layout1c } from "@/components/live/layout-1c";
import { MobileScoringScreen } from "@/components/live/mobile-scoring";
import { ShotFlow } from "@/components/live/shot-flow";
import { PlayHistory } from "@/components/live/play-history";
import { LiveNotices } from "@/components/live/live-notices";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface EventData {
  game_type: string | null;
  opponent: string | null;
  description: string | null;
  title: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  competition: string | null;
  season_id: string | null;
}

interface ActivePlayer {
  player_id: string;
  name: string | null;
  number: number | null;
}

function resolveOpponent(ev: EventData | null): string {
  if (!ev) return "";
  if (ev.opponent) return ev.opponent;
  if (ev.description) {
    try {
      const d = JSON.parse(ev.description) as { is_home?: boolean; home_team?: string; away_team?: string };
      if (d.is_home === false && d.home_team) return d.home_team;
      if (d.is_home === true && d.away_team) return d.away_team;
      if (d.home_team) return d.home_team;
    } catch { /* */ }
  }
  return "";
}

function formatGameInfo(ev: EventData | null, opponent: string): string {
  if (!opponent) return "";
  const parts: string[] = [`vs ${opponent}`];
  if (ev?.description) {
    try {
      const d = JSON.parse(ev.description) as { is_home?: boolean };
      if (d.is_home === true) parts.push("Casa");
      else if (d.is_home === false) parts.push("Fora");
    } catch { /* */ }
  }
  if (ev?.event_date) {
    const [, m, d] = ev.event_date.split("-");
    const timeStr = ev.event_time ? ev.event_time.slice(0, 5) : "";
    parts.push(timeStr ? `${d}/${m} ${timeStr}` : `${d}/${m}`);
  }
  return parts.join(" · ");
}

export default function LiveGamePage() {
  const clubName = useClubName();
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const { prefs, setLayout, setDark, setFullscreen } = useLivePrefs();
  const { user } = useCurrentUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Orientação do dispositivo ─────────────────────────────
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== "undefined" && window.innerWidth > window.innerHeight
  );
  // Viewport curto (≤500px) → tela de telemóvel em landscape
  const [isMobileHeight, setIsMobileHeight] = useState(() =>
    typeof window !== "undefined" && window.innerHeight <= 500
  );

  // Largura de telemóvel (<700px) — tablets nunca usam o ecrã de marcação mobile
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 700
  );

  useEffect(() => {
    function update() {
      setIsLandscape(window.innerWidth > window.innerHeight);
      setIsMobileHeight(window.innerHeight <= 500);
      setIsNarrow(window.innerWidth < 700);
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // ── Modo de marcação mobile: landscape + fullscreen OU telemóvel em landscape ──
  // Só telemóveis em landscape usam o ecrã mobile; em tablet (fullscreen ou não) mantém-se o template escolhido.
  const isMobileScoring = isLandscape && isMobileHeight;
  const needsRotate = isFullscreen && !isLandscape && isNarrow;

  // ── Event data (opponent, game_type, etc.) ───────────────
  const [isFriendly, setIsFriendly] = useState(false);
  const [eventData, setEventData] = useState<EventData | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("game_type, opponent, description, title, event_date, event_time, location, competition, season_id")
      .eq("id", params.eventId)
      .single()
      .then(({ data }) => {
        if (data) {
          setEventData(data as EventData);
          if (data.game_type === "friendly") setIsFriendly(true);
        }
      });
  }, [params.eventId]);

  const game = useLiveGame(params.eventId);
  const {
    session, roster, onCourt, bench, onCourtIds, plays, clockSecs, loading, recording,
    startGame, startClock, stopClock,
    recordPlay, pendingShot, confirmShot, cancelShot,
    recordOpponentPoints, recordOpponentMiss, recordOpponentFoul, recordOpponentReb,
    substitutePlayer, setLineup, undoPlay, nextPeriod, finishGame,
  } = game;

  // ── Dialog state ─────────────────────────────────────────
  const [startDialog, setStartDialog] = useState(false);
  const [opponentName, setOpponentName] = useState("");
  // Duração de cada período (minutos) — 8 por defeito, ajustável no início do jogo
  const [periodMinutes, setPeriodMinutes] = useState<string>("8");
  const [startingFive, setStartingFive] = useState<string[]>([]);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [finishDialog, setFinishDialog] = useState(false);

  const [editingOpponent, setEditingOpponent] = useState(false);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [useActivePlayers, setUseActivePlayers] = useState(false);

  // Pre-fill opponent from event data
  useEffect(() => {
    const resolved = resolveOpponent(eventData);
    if (resolved) setOpponentName(resolved);
  }, [eventData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load active roster when no callups exist
  useEffect(() => {
    // Only the game's own season/club roster — never another club's players
    if (!loading && !session && roster.length === 0 && eventData?.season_id) {
      const supabase = createClient();
      supabase
        .from("v_roster")
        .select("player_id, name, number")
        .eq("season_id", eventData.season_id)
        .order("number", { ascending: true, nullsFirst: false })
        .then(({ data }) => { if (data) setActivePlayers(data as ActivePlayer[]); });
    }
  }, [loading, session, roster.length, eventData?.season_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading && !session) setStartDialog(true);
  }, [loading, session]);

  // ── Fullscreen ────────────────────────────────────────────
  useEffect(() => {
    function onFsChange() {
      const full = !!(
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
      );
      setIsFullscreen(full);
      setFullscreen(full);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isFullscreen) {
      (el.requestFullscreen?.() ?? Promise.resolve()).catch(() => {});
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.().catch(() => {});
      (document as unknown as { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
    }
  }, [isFullscreen]);

  // ── Esc key: close share/summary first, then fullscreen ───
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && (shareOpen || summaryOpen)) {
        setShareOpen(false);
        setSummaryOpen(false);
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [summaryOpen, shareOpen]);

  // ── Derived stats from events ─────────────────────────────
  const { playerMap: basePlayerMap, homeFouls, awayFouls, awayRebOff, awayRebDef } = useMemo(
    () => deriveStats(plays, session?.current_period ?? 1),
    [plays, session?.current_period]
  );
  // Tempo jogado por jogador (stints em campo + relógio atual)
  const clockWhole = Math.floor(clockSecs);
  const secsById = useMemo(
    () => computeSecondsPlayed(game.stints, session?.current_period ?? 1, clockWhole, session?.status === "live"),
    [game.stints, session?.current_period, session?.status, clockWhole]
  );
  const playerMap = useMemo(
    () => withSecondsPlayed(basePlayerMap, secsById),
    [basePlayerMap, secsById]
  );

  // ── Fim do tempo regulamentar ─────────────────────────────
  // A partir do 4.º período: se não houver empate, o próximo passo é
  // finalizar o jogo; em caso de empate, segue para prolongamento.
  const REGULATION_PERIODS = 4;
  const atOrPastRegulation = (session?.current_period ?? 0) >= REGULATION_PERIODS;
  const isTied = (session?.home_score ?? 0) === (session?.away_score ?? 0);
  const periodClockDone = !!session && !session.clock_running && clockWhole <= 0;
  const canFinish = session?.status === "live" && atOrPastRegulation && !isTied;
  const showEndBanner = session?.status === "live" && atOrPastRegulation && periodClockDone;
  const handleNextPeriod = () => {
    if (canFinish) setFinishDialog(true);
    else setPeriodDialog(true);
  };

  const tokens = prefs.dark ? DARK_TOKENS : LIGHT_TOKENS;
  const isLive = session?.status === "live";
  const isFinished = session?.status === "finished";
  const resolvedOpponent = resolveOpponent(eventData);

  // ── Shared layout props ───────────────────────────────────
  const layoutProps = session ? {
    session,
    roster,
    onCourt,
    bench,
    plays,
    derivedStats: playerMap,
    clockSecs,
    recording,
    homeFouls,
    // Derivados das jogadas (sempre recarregadas após cada registo) — não
    // dependem do eco do Realtime em game_sessions.
    awayFouls,
    awayRebOff,
    awayRebDef,
    onRecordPlay: (eventType: import("@/types/database").PlayEventType, playerId: string) =>
      recordPlay({ event_type: eventType, player_id: playerId }),
    onRecordOpponentPoints: recordOpponentPoints,
    onRecordOpponentMiss: recordOpponentMiss,
    onRecordOpponentFoul: recordOpponentFoul,
    onRecordOpponentReb: recordOpponentReb,
    onStartClock: startClock,
    onStopClock: stopClock,
    onNextPeriod: handleNextPeriod,
    onSubstitute: substitutePlayer,
    onSetLineup: setLineup,
    onUndoPlay: undoPlay,
  } : null;

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...tokens, background: "var(--bg)", padding: 16, display: "flex", flexDirection: "column", gap: 14, minHeight: "100%", fontFamily: SANS } as React.CSSProperties}>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="live-press"
      style={{
        ...tokens,
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: SANS,
        minHeight: isFullscreen ? "100vh" : "100%",
        height: isFullscreen ? "100vh" : undefined,
        overflowY: isFullscreen ? "auto" : undefined,
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      } as React.CSSProperties}
    >
      {/* ── Barra de preferências ou barra mínima de ecrã cheio ── */}
      {isFullscreen ? (
        <div style={{
          // sticky + left gap: iPadOS draws its own close (X) button over the top-left corner in full screen
          position: "sticky", top: 0, zIndex: 120,
          display: "flex", alignItems: "center", gap: 12, padding: "8px 16px 8px 92px", minHeight: 76,
          background: "var(--panel)", borderBottom: "1px solid var(--line)", flexShrink: 0,
        }}>
          <button
            onClick={toggleFullscreen}
            style={{
              height: 44, padding: "0 16px", borderRadius: 10, border: "none",
              background: "oklch(0.22 0.02 250)", color: "white",
              fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            ⤡ Exit full screen
          </button>
          <button
            onClick={() => setSummaryOpen(true)}
            style={{
              height: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
              background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)",
            }}
          >
            ▤ Stats &amp; AI
          </button>
          {session && (
            <button
              onClick={() => setHistoryOpen(true)}
              style={{
                height: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
                fontFamily: SANS, fontSize: 13, fontWeight: 700,
                background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)",
              }}
            >
              ↶ History / Undo
            </button>
          )}
          <button
            onClick={() => setShareOpen(true)}
            style={{
              height: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
              background: "oklch(0.33 0.1 145)", border: "none",
              color: "oklch(0.9 0.12 145)",
            }}
          >
            ↗ Export
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS }}>or press Esc</span>
        </div>
      ) : (
        <LivePrefsBar
          prefs={prefs}
          onSetLayout={setLayout}
          onSetDark={setDark}
          onToggleFullscreen={toggleFullscreen}
          onOpenSummary={() => setSummaryOpen(true)}
          onOpenShare={() => setShareOpen(true)}
          onOpenHistory={session ? () => setHistoryOpen(true) : undefined}
        />
      )}

      {/* ── Aviso: jogo de treino ─── */}
      {isFriendly && !isMobileScoring && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 16px", flexShrink: 0,
          background: "oklch(0.97 0.04 80)", borderBottom: "1px solid oklch(0.85 0.08 80)",
          color: "oklch(0.45 0.1 70)", fontSize: 11, fontWeight: 700, fontFamily: SANS,
        }}>
          🏋️ TRAINING GAME — does not count towards the standings
        </div>
      )}

      {/* ── Fim do 4.º período / prolongamento: finalizar o jogo ─── */}
      {showEndBanner && session && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "10px 16px", flexShrink: 0, fontFamily: SANS,
          background: isTied ? "oklch(0.97 0.04 80)" : "var(--accentSoft)",
          borderBottom: `1px solid ${isTied ? "oklch(0.85 0.08 80)" : "var(--accent)"}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", flex: 1, minWidth: 200 }}>
            {isTied
              ? `Tied ${session.home_score}–${session.away_score} at the end of period ${session.current_period} — heading to overtime.`
              : `End of ${session.current_period > REGULATION_PERIODS ? "overtime" : "period 4"} · ${clubName} ${session.home_score}–${session.away_score} ${session.opponent_name}`}
          </span>
          {isTied ? (
            <button onClick={() => setPeriodDialog(true)} disabled={recording}
              style={{ height: 44, padding: "0 18px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "var(--accent)", color: "var(--accentInk)", fontSize: 14, fontWeight: 800 }}>
              ⏱ Overtime
            </button>
          ) : (
            <button onClick={() => setFinishDialog(true)} disabled={recording}
              style={{ height: 44, padding: "0 18px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "oklch(0.55 0.2 25)", color: "white", fontSize: 14, fontWeight: 800 }}>
              🏁 Finish game
            </button>
          )}
        </div>
      )}

      {/* ── Ecrã de marcação mobile (landscape + fullscreen) ─── */}
      {isMobileScoring && isLive && session && user && (
        <MobileScoringScreen game={game} userId={user.id} />
      )}

      {/* Prompt de rotação (portrait + fullscreen) */}
      {needsRotate && (
        <div style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            24,
          background:     "var(--bg)",
          padding:        32,
          textAlign:      "center",
        }}>
          <div style={{ fontSize: 64, lineHeight: 1 }}>↻</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", fontFamily: SANS }}>
            Rotate your device to landscape
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)", fontFamily: SANS }}>
            The live scorer works in landscape.
          </p>
          {session && (
            <div style={{ display: "flex", gap: 32, fontFamily: SANS }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>CD PÓVOA</p>
                <p style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: "var(--text)", margin: 0 }}>{session.home_score}</p>
              </div>
              <span style={{ color: "var(--dim)", fontSize: 24, alignSelf: "center" }}>—</span>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>{session.opponent_name}</p>
                <p style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: "var(--text)", margin: 0 }}>{session.away_score}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Live layouts (desktop / tablet, ou mobile sem fullscreen) ─ */}
      {(!isMobileScoring && !needsRotate) && isLive && layoutProps && (
        <>
          {prefs.layout === "a" && <Layout1a {...layoutProps} />}
          {prefs.layout === "b" && <Layout1b {...layoutProps} />}
          {prefs.layout === "c" && <Layout1c {...layoutProps} />}
        </>
      )}

      {/* ── Finished view ──────────────────────────────────── */}
      {isFinished && session && (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏁</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", fontFamily: SANS, margin: 0 }}>
              Game Finished
            </h2>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginTop: 16 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", margin: 0 }}>CD PÓVOA</p>
                <p style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: "var(--text)", margin: 0 }}>{session.home_score}</p>
              </div>
              <span style={{ color: "var(--dim)", fontSize: 24 }}>—</span>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", margin: 0 }}>{session.opponent_name}</p>
                <p style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: "var(--text)", margin: 0 }}>{session.away_score}</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => router.push(`/jogos/${params.eventId}/stats`)}
            style={{ background: "var(--accent)", color: "var(--accentInk)", fontFamily: SANS }}
          >
            View full box score
          </Button>
          {eventData?.competition === "Liga" && eventData?.game_type !== "friendly" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              <Button variant="outline" disabled={game.publishing} onClick={() => game.publishToLeague()}>
                {game.publishing ? "Publishing…" : "🏆 Publish result and stats to Liga INATEL"}
              </Button>
              <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS, textAlign: "center" }}>
                Done automatically when the game ends. Use this button only to publish again.
              </span>
            </div>
          )}
        </div>
      )}

      <LiveNotices />
      <style>{`.live-press button:active:not(:disabled){transform:scale(0.96);filter:brightness(1.2);transition:transform .06s}`}</style>

      {/* ── Shot location + assist (inside the container so it also shows in full screen) ── */}
      {pendingShot && session && (
        <ShotFlow
          shot={pendingShot}
          opponentName={session.opponent_name}
          roster={roster}
          onCourt={onCourt}
          saving={recording}
          onConfirm={confirmShot}
          onCancel={cancelShot}
        />
      )}

      {/* ── Play history (full list, filter by period, undo any play) ── */}
      {isMobileScoring && session && !historyOpen && !pendingShot && (
        <button
          onClick={() => setHistoryOpen(true)}
          style={{
            position: "fixed", left: 12, bottom: 12, zIndex: 150,
            padding: "10px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800, fontFamily: SANS,
            border: "1px solid var(--line)", background: "var(--panel, var(--bg))", color: "var(--text)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.3)", cursor: "pointer",
          }}
        >
          ↶ History / Undo
        </button>
      )}
      {historyOpen && session && (
        <PlayHistory plays={plays} roster={roster} recording={recording} onUndoPlay={undoPlay} onClose={() => setHistoryOpen(false)} />
      )}

      {/* ── Summary overlay ────────────────────────────────── */}
      {summaryOpen && session && (
        <SummaryOverlay
          session={session}
          roster={roster}
          onCourtIds={onCourtIds}
          plays={plays}
          clockSecs={clockSecs}
          secsById={secsById}
          tokens={tokens}
          onClose={() => setSummaryOpen(false)}
          onExport={() => setShareOpen(true)}
        />
      )}

      {/* ── Share overlay ──────────────────────────────────── */}
      {shareOpen && session && (
        <ShareOverlay
          session={session}
          roster={roster}
          plays={plays}
          playerMap={playerMap}
          clockSecs={clockSecs}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* ── DIALOG: Iniciar Jogo ─────────────────────────── */}
      <Dialog
        open={startDialog}
        onOpenChange={(v) => {
          if (session) setStartDialog(v);
          else if (!v) router.push("/jogos"); // sem jogo iniciado, fechar = voltar aos jogos (UX-09)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>🏀 Start Game</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Adversário */}
            <div className="space-y-1.5">
              <Label>Opponent</Label>
              {resolvedOpponent && !editingOpponent ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{formatGameInfo(eventData, resolvedOpponent)}</span>
                  <button
                    type="button"
                    onClick={() => setEditingOpponent(true)}
                    className="text-xs text-muted-foreground underline hover:text-foreground shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <Input
                  placeholder="Lions BC"
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  autoFocus={editingOpponent}
                />
              )}
            </div>
            {/* Tempo de jogo por período */}
            <div className="space-y-1.5">
              <Label htmlFor="period-minutes">Period length (minutes)</Label>
              <div className="flex items-center gap-1.5">
                {[8, 10, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPeriodMinutes(String(m))}
                    className={`text-xs rounded-md px-3 py-1.5 border transition-all ${
                      Number(periodMinutes) === m
                        ? "bg-cdpovoa-primary text-white border-cdpovoa-primary font-bold"
                        : "border-border hover:border-cdpovoa-primary"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
                <Input
                  id="period-minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  step={1}
                  value={periodMinutes}
                  onChange={(e) => setPeriodMinutes(e.target.value)}
                  className="w-20 h-8"
                />
              </div>
            </div>
            {/* Seleção de jogadores */}
            {roster.length === 0 ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">There is no squad call-up for this game yet.</p>
                  <div className="mt-2 flex gap-3">
                    <a
                      href={`/jogos/${params.eventId}/convocatoria`}
                      className="text-xs text-amber-700 underline hover:text-amber-900"
                    >
                      → Go to call-up
                    </a>
                    {!useActivePlayers && activePlayers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUseActivePlayers(true)}
                        className="text-xs text-amber-700 underline hover:text-amber-900"
                      >
                        Choose from roster
                      </button>
                    )}
                  </div>
                </div>
                {useActivePlayers && (
                  <div className="space-y-1.5">
                    <Label>Starting five — active roster (select up to 5)</Label>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {activePlayers.map((p) => (
                        <button
                          key={p.player_id}
                          type="button"
                          onClick={() => setStartingFive((prev) =>
                            prev.includes(p.player_id)
                              ? prev.filter((id) => id !== p.player_id)
                              : prev.length < 5 ? [...prev, p.player_id] : prev
                          )}
                          className={`text-xs rounded-md px-2.5 py-1.5 border transition-all ${
                            startingFive.includes(p.player_id)
                              ? "bg-cdpovoa-primary text-white border-cdpovoa-primary font-bold"
                              : "border-border hover:border-cdpovoa-primary"
                          }`}
                        >
                          {p.number ? `#${p.number} ` : ""}{(p.name ?? "?").split(" ")[0]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{startingFive.length}/5 selected</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Starting five (select up to 5)</Label>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {roster.map((p) => (
                    <button
                      key={p.user_id}
                      type="button"
                      onClick={() => setStartingFive((prev) =>
                        prev.includes(p.user_id)
                          ? prev.filter((id) => id !== p.user_id)
                          : prev.length < 5 ? [...prev, p.user_id] : prev
                      )}
                      className={`text-xs rounded-md px-2.5 py-1.5 border transition-all ${
                        startingFive.includes(p.user_id)
                          ? "bg-cdpovoa-primary text-white border-cdpovoa-primary font-bold"
                          : "border-border hover:border-cdpovoa-primary"
                      }`}
                    >
                      #{p.jersey_number} {p.user.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{startingFive.length}/5 selected</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={recording} onClick={() => router.push("/jogos")}>
              Cancel
            </Button>
            <Button disabled={recording}
              onClick={async () => {
                const nameToUse = opponentName || resolvedOpponent || "Adversário";
                const didEditOpponent = editingOpponent && opponentName && opponentName !== resolvedOpponent;
                const mins = Number(periodMinutes);
                const periodSecs = Number.isFinite(mins) && mins >= 1 && mins <= 20
                  ? Math.round(mins * 60)
                  : DEFAULT_PERIOD_SECS;
                const ok = await startGame(
                  nameToUse,
                  startingFive,
                  useActivePlayers ? activePlayers.map((p) => p.player_id) : undefined,
                  periodSecs
                );
                if (ok) {
                  if (didEditOpponent) {
                    const supabase = createClient();
                    await supabase.from("events").update({ opponent: opponentName }).eq("id", params.eventId);
                  }
                  setStartDialog(false);
                }
              }}
            >
              {recording ? "Starting…" : "Start Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Próximo Período ──────────────────────── */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{atOrPastRegulation ? "Overtime" : "Next Period"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {atOrPastRegulation
              ? <>Game tied {session?.home_score}–{session?.away_score}. End period {session?.current_period} and go to overtime?</>
              : <>End period {session?.current_period} and move to period {(session?.current_period ?? 0) + 1}?</>}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialog(false)}>Cancel</Button>
            <Button onClick={async () => { await nextPeriod(); setPeriodDialog(false); }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Terminar Jogo ────────────────────────── */}
      <Dialog open={finishDialog} onOpenChange={setFinishDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Finish Game</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <ClubName /> <strong>{session?.home_score}</strong> –{" "}
            <strong>{session?.away_score}</strong> {session?.opponent_name}
            <br />Confirm the final score? Once the game is finished, no stats can be changed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={recording}
              onClick={async () => { const ok = await finishGame(); if (ok) setFinishDialog(false); }}>
              🏁 Finish Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
