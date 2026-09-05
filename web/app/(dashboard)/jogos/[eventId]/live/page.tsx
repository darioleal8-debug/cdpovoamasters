"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveGame } from "@/hooks/use-live-game";
import { useLivePrefs } from "@/hooks/use-live-prefs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createClient } from "@/lib/supabase/client";
import { deriveStats } from "@/lib/live/derive-stats";
import { LIGHT_TOKENS, DARK_TOKENS, SANS, MONO } from "@/components/live/tokens";
import { LivePrefsBar } from "@/components/live/live-prefs-bar";
import { SummaryOverlay } from "@/components/live/summary-overlay";
import { ShareOverlay } from "@/components/live/share-overlay";
import { Layout1a } from "@/components/live/layout-1a";
import { Layout1b } from "@/components/live/layout-1b";
import { Layout1c } from "@/components/live/layout-1c";
import { MobileScoringScreen } from "@/components/live/mobile-scoring";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function LiveGamePage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const { prefs, setLayout, setDark, setFullscreen } = useLivePrefs();
  const { user } = useCurrentUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // ── Orientação do dispositivo ─────────────────────────────
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== "undefined" && window.innerWidth > window.innerHeight
  );
  // Viewport curto (≤500px) → tela de telemóvel em landscape
  const [isMobileHeight, setIsMobileHeight] = useState(() =>
    typeof window !== "undefined" && window.innerHeight <= 500
  );

  useEffect(() => {
    function update() {
      setIsLandscape(window.innerWidth > window.innerHeight);
      setIsMobileHeight(window.innerHeight <= 500);
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // ── Modo de marcação mobile: landscape + fullscreen OU telemóvel em landscape ──
  const isMobileScoring = isLandscape && (isFullscreen || isMobileHeight);

  // ── Friendly game flag ────────────────────────────────────
  const [isFriendly, setIsFriendly] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("game_type")
      .eq("id", params.eventId)
      .single()
      .then(({ data }) => { if (data?.game_type === "friendly") setIsFriendly(true); });
  }, [params.eventId]);

  const game = useLiveGame(params.eventId);
  const {
    session, roster, onCourt, bench, onCourtIds, plays, clockSecs, loading, recording,
    startGame, startClock, stopClock,
    recordPlay, recordOpponentPoints, recordOpponentFoul, recordOpponentReb,
    substitutePlayer, setLineup, undoPlay, nextPeriod, finishGame,
  } = game;

  // ── Dialog state ─────────────────────────────────────────
  const [startDialog, setStartDialog] = useState(false);
  const [opponentName, setOpponentName] = useState("");
  const [startingFive, setStartingFive] = useState<string[]>([]);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [finishDialog, setFinishDialog] = useState(false);

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
  const { playerMap, homeFouls } = useMemo(
    () => deriveStats(plays, session?.current_period ?? 1),
    [plays, session?.current_period]
  );

  const tokens = prefs.dark ? DARK_TOKENS : LIGHT_TOKENS;
  const isLive = session?.status === "live";
  const isFinished = session?.status === "finished";

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
    awayFouls: session.away_fouls ?? 0,
    awayRebOff: session.away_reb_off ?? 0,
    awayRebDef: session.away_reb_def ?? 0,
    onRecordPlay: (eventType: import("@/types/database").PlayEventType, playerId: string) =>
      recordPlay({ event_type: eventType, player_id: playerId }),
    onRecordOpponentPoints: recordOpponentPoints,
    onRecordOpponentFoul: recordOpponentFoul,
    onRecordOpponentReb: recordOpponentReb,
    onStartClock: startClock,
    onStopClock: stopClock,
    onNextPeriod: () => setPeriodDialog(true),
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
          display: "flex", alignItems: "center", gap: 12, padding: "8px 16px",
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
            ⤡ Sair do ecrã cheio
          </button>
          <button
            onClick={() => setSummaryOpen(true)}
            style={{
              height: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
              background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)",
            }}
          >
            ▤ Resumo estatístico
          </button>
          <button
            onClick={() => setShareOpen(true)}
            style={{
              height: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
              background: "oklch(0.33 0.1 145)", border: "none",
              color: "oklch(0.9 0.12 145)",
            }}
          >
            ↗ Exportar
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS }}>ou tecla Esc</span>
        </div>
      ) : (
        <LivePrefsBar
          prefs={prefs}
          onSetLayout={setLayout}
          onSetDark={setDark}
          onToggleFullscreen={toggleFullscreen}
          onOpenSummary={() => setSummaryOpen(true)}
          onOpenShare={() => setShareOpen(true)}
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
          🏋️ JOGO DE TREINO — não conta para a classificação
        </div>
      )}

      {/* ── Ecrã de marcação mobile (landscape + fullscreen) ─── */}
      {isMobileScoring && isLive && session && user && (
        <MobileScoringScreen game={game} userId={user.id} />
      )}

      {/* Prompt de rotação (portrait + fullscreen) */}
      {isFullscreen && !isLandscape && (
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
            Roda o dispositivo para landscape
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)", fontFamily: SANS }}>
            O ecrã de marcação ao vivo funciona na horizontal.
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
      {(!isMobileScoring && !(isFullscreen && !isLandscape)) && isLive && layoutProps && (
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
              Jogo Terminado
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
            Ver Box Score Completo
          </Button>
        </div>
      )}

      {/* ── Summary overlay ────────────────────────────────── */}
      {summaryOpen && session && (
        <SummaryOverlay
          session={session}
          roster={roster}
          onCourtIds={onCourtIds}
          plays={plays}
          clockSecs={clockSecs}
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
      <Dialog open={startDialog} onOpenChange={(v) => { if (session) setStartDialog(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>🏀 Iniciar Jogo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do adversário</Label>
              <Input placeholder="Lions BC" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>5 inicial (seleciona até 5)</Label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {roster.map((p) => (
                  <button key={p.user_id}
                    onClick={() => setStartingFive((prev) =>
                      prev.includes(p.user_id)
                        ? prev.filter((id) => id !== p.user_id)
                        : prev.length < 5 ? [...prev, p.user_id] : prev
                    )}
                    className={`text-xs rounded-md px-2.5 py-1.5 border transition-all ${
                      startingFive.includes(p.user_id)
                        ? "bg-cdpovoa-primary text-white border-cdpovoa-primary font-bold"
                        : "border-border hover:border-cdpovoa-primary"
                    }`}>
                    #{p.jersey_number} {p.user.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{startingFive.length}/5 selecionados</p>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={recording}
              onClick={async () => {
                const ok = await startGame(opponentName || "Adversário", startingFive);
                if (ok) setStartDialog(false);
              }}>
              {recording ? "A iniciar…" : "Iniciar Jogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Próximo Período ──────────────────────── */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Próximo Período</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Terminar o {session?.current_period}º período e avançar para o {(session?.current_period ?? 0) + 1}º?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialog(false)}>Cancelar</Button>
            <Button onClick={async () => { await nextPeriod(); setPeriodDialog(false); }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Terminar Jogo ────────────────────────── */}
      <Dialog open={finishDialog} onOpenChange={setFinishDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Terminar Jogo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            CD Póvoa <strong>{session?.home_score}</strong> –{" "}
            <strong>{session?.away_score}</strong> {session?.opponent_name}
            <br />Confirmas o resultado final?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishDialog(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={recording}
              onClick={async () => { const ok = await finishGame(); if (ok) setFinishDialog(false); }}>
              🏁 Terminar Jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
