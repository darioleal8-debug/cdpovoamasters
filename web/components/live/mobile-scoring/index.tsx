"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PlayEventType } from "@/types/database";
import type { UseLiveGameReturn } from "./types";
import { ScoringQueue, makeQueuedEvent } from "@/lib/scoring-queue";
import { ScoreBar }        from "./score-bar";
import { PlayerStrip }     from "./player-strip";
import { ActionKeyboard }  from "./action-keyboard";
import { CourtDiagram }    from "./court-diagram";
import { UndoToast }       from "./undo-toast";
import { LastActionsPanel } from "./last-actions-panel";
import type { UndoItem }   from "./undo-toast";
import { formatClock }     from "@/hooks/use-live-game";

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type Phase =
  | { step: "idle" }
  | { step: "player_selected";   playerId: string }
  | { step: "awaiting_location"; playerId: string; eventType: PlayEventType; pts: number };

const SHOT_TIMEOUT_MS = 8_000; // 8 s sem toque → registar sem localização

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  game: UseLiveGameReturn;
  userId: string;
}

export function MobileScoringScreen({ game, userId }: Props) {
  const {
    session, roster, onCourtIds, plays, clockSecs,
    undoPlay,
  } = game;

  const [phase,       setPhase]       = useState<Phase>({ step: "idle" });
  const [undoItem,    setUndoItem]    = useState<UndoItem | null>(null);
  const [showPanel,   setShowPanel]   = useState(false);
  const [pendingIds,  setPendingIds]  = useState<Set<string>>(new Set());

  const shotTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef   = useRef<WakeLockSentinel | null>(null);

  // ── Wake Lock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let released = false;
    navigator.wakeLock.request("screen").then((lock) => {
      if (released) { lock.release(); return; }
      wakeLockRef.current = lock;
    }).catch(() => {});
    return () => {
      released = true;
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // Re-adquirir Wake Lock após visibilitychange (iOS liberta ao mudar tab)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((lock) => {
          wakeLockRef.current = lock;
        }).catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── Flush offline queue no mount e ao voltar online ───────────────────────
  useEffect(() => {
    ScoringQueue.flush();
    const onOnline = () => ScoringQueue.flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // ── Cancelar timer de lançamento ao sair do passo ─────────────────────────
  function clearShotTimer() {
    if (shotTimerRef.current) {
      clearTimeout(shotTimerRef.current);
      shotTimerRef.current = null;
    }
  }

  // ── Registar um evento (com fila offline) ────────────────────────────────
  const recordEvent = useCallback(async (
    playerId:  string,
    eventType: PlayEventType,
    pts:       number,
    shotX:     number | null = null,
    shotY:     number | null = null,
    shotZone:  string | null = null,
  ) => {
    if (!session) return;

    const clientId = crypto.randomUUID();
    const clock    = formatClock(clockSecs);
    const homeAfter = eventType.endsWith("_made") && pts > 0
      ? session.home_score + pts
      : session.home_score;

    const event = makeQueuedEvent({
      client_id:           clientId,
      game_session_id:     session.id,
      season_id:           session.season_id,
      player_id:           playerId,
      secondary_player_id: null,
      event_type:          eventType,
      period:              session.current_period,
      game_clock:          clock,
      shot_x:              shotX,
      shot_y:              shotY,
      shot_zone:           shotZone,
      is_home_team:        true,
      points_delta:        pts,
      home_score_after:    homeAfter,
      away_score_after:    session.away_score,
      description:         null,
    });

    // Optimistic: marcar como pendente
    setPendingIds((prev) => new Set(prev).add(clientId));

    // Persistir na fila (crash safety)
    await ScoringQueue.push(event);

    // Enviar imediatamente
    try {
      const res = await fetch("/api/play-events", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(event),
      });
      if (res.ok) {
        await ScoringQueue.remove(clientId);
        setPendingIds((prev) => { const n = new Set(prev); n.delete(clientId); return n; });
      }
    } catch {
      // permanece na fila, flush vai tentar novamente
    }

    // Preparar UndoToast (5 s)
    const player = roster.find((p) => p.user_id === playerId);
    const jersey = player?.jersey_number ?? "?";
    const name   = player?.user.name.split(" ")[0] ?? "";
    const label  = EVENT_LABELS[eventType] ?? eventType;
    setUndoItem({
      playId:    null,  // id do servidor chega via realtime → updated quando plays muda
      clientId,
      label:     `#${jersey} ${name} · ${label}`,
      expiresAt: Date.now() + 5_000,
    });
  }, [session, clockSecs, roster]);

  // Actualizar playId no undoItem quando o play chega do servidor
  useEffect(() => {
    if (!undoItem || undoItem.playId !== null) return;
    const serverPlay = plays.find((p) => p.client_id === undoItem.clientId);
    if (serverPlay) {
      setUndoItem((u) => u ? { ...u, playId: serverPlay.id } : null);
    }
  }, [plays, undoItem]);

  // ── Ciclo de 3 toques ─────────────────────────────────────────────────────

  function handlePlayerSelect(playerId: string) {
    clearShotTimer();
    if (phase.step === "player_selected" && phase.playerId === playerId) {
      // Toggle off
      setPhase({ step: "idle" });
    } else {
      setPhase({ step: "player_selected", playerId });
    }
  }

  function handleAction(eventType: PlayEventType, pts: number, needsLocation: boolean) {
    if (phase.step !== "player_selected") return;
    const { playerId } = phase;

    if (needsLocation) {
      // Aguardar localização — timeout de 8 s
      setPhase({ step: "awaiting_location", playerId, eventType, pts });
      shotTimerRef.current = setTimeout(() => {
        // Tempo esgotado → registar sem localização
        recordEvent(playerId, eventType, pts);
        setPhase({ step: "idle" });
      }, SHOT_TIMEOUT_MS);
    } else {
      recordEvent(playerId, eventType, pts);
      setPhase({ step: "idle" });
    }
  }

  function handleLocationPick(x: number, y: number, zone: string) {
    if (phase.step !== "awaiting_location") return;
    clearShotTimer();
    const { playerId, eventType, pts } = phase;
    recordEvent(playerId, eventType, pts, x, y, zone);
    setPhase({ step: "idle" });
  }

  function handleSkipLocation() {
    if (phase.step !== "awaiting_location") return;
    clearShotTimer();
    const { playerId, eventType, pts } = phase;
    recordEvent(playerId, eventType, pts);
    setPhase({ step: "idle" });
  }

  // ── Desfazer ─────────────────────────────────────────────────────────────
  async function handleUndo(item: UndoItem) {
    setUndoItem(null);
    if (item.playId) {
      await undoPlay(item.playId);
    } else {
      // Ainda não confirmado pelo servidor — remover da fila
      await ScoringQueue.remove(item.clientId);
      setPendingIds((prev) => { const n = new Set(prev); n.delete(item.clientId); return n; });
    }
  }

  async function handleUndoFromPanel(playId: string) {
    setShowPanel(false);
    await undoPlay(playId);
  }

  // ── Dados derivados ───────────────────────────────────────────────────────
  const selectedId  = phase.step !== "idle" ? phase.playerId : null;
  const showCourt   = phase.step === "awaiting_location";

  const recentShots = plays
    .filter((p) => !p.deleted_at && p.shot_x != null && p.shot_y != null)
    .slice(0, 20)
    .map((p) => ({
      x:    p.shot_x!,
      y:    p.shot_y!,
      made: p.event_type.endsWith("_made"),
    }));

  if (!session) return null;

  return (
    <div style={{
      flex:          1,
      display:       "flex",
      flexDirection: "column",
      background:    "#0A1220",
      overflow:      "hidden",
      position:      "relative",
      userSelect:    "none",
    }}>
      {/* Barra de marcação */}
      <ScoreBar
        session={session}
        clockSecs={clockSecs}
        onShowPanel={() => setShowPanel(true)}
      />

      {/* Zona de 3 colunas */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Esquerda — jogadores */}
        <PlayerStrip
          roster={roster}
          onCourtIds={onCourtIds}
          selectedId={selectedId}
          onSelect={handlePlayerSelect}
        />

        {/* Centro — campo (só durante awaiting_location) ou zona neutra */}
        {showCourt ? (
          <CourtDiagram
            recentShots={recentShots}
            onLocationPick={handleLocationPick}
            onSkip={handleSkipLocation}
          />
        ) : (
          <div style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            background:     "#0D1729",
            gap:            16,
            padding:        "0 16px",
          }}>
            {phase.step === "idle" && (
              <p style={{ fontSize: 13, color: "rgba(169,180,199,.25)", textAlign: "center" }}>
                1. Seleciona jogador{"\n"}2. Seleciona ação
              </p>
            )}
            {phase.step === "player_selected" && (
              <>
                <div style={{
                  width:         64,
                  height:        64,
                  borderRadius:  "50%",
                  background:    "rgba(249,115,22,.15)",
                  border:        "2px solid rgba(249,115,22,.4)",
                  display:       "flex",
                  alignItems:    "center",
                  justifyContent: "center",
                }}>
                  <span style={{
                    fontFamily:    "'Barlow Condensed', 'Barlow', sans-serif",
                    fontSize:      28,
                    fontWeight:    800,
                    color:         "#F97316",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    #{roster.find((p) => p.user_id === phase.playerId)?.jersey_number ?? "?"}
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#C2D3F0", margin: 0 }}>
                  {roster.find((p) => p.user_id === phase.playerId)?.user.name.split(" ")[0]}
                </p>
                <p style={{ fontSize: 11, color: "rgba(169,180,199,.4)", margin: 0 }}>
                  Seleciona uma ação →
                </p>
              </>
            )}
            {/* Indicador de eventos pendentes */}
            {pendingIds.size > 0 && (
              <div style={{
                position:   "absolute",
                bottom:     8,
                left:       "50%",
                transform:  "translateX(-50%)",
                fontSize:   10,
                color:      "rgba(249,115,22,.5)",
                display:    "flex",
                alignItems: "center",
                gap:        4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#F97316",
                  animation: "pulse 1.5s infinite",
                }} />
                {pendingIds.size} a sincronizar…
              </div>
            )}
          </div>
        )}

        {/* Direita — teclado de ações */}
        <ActionKeyboard
          selectedPlayerId={selectedId}
          onAction={handleAction}
        />

        {/* Painel de últimas ações (overlay) */}
        {showPanel && (
          <LastActionsPanel
            plays={plays}
            roster={roster}
            onUndo={handleUndoFromPanel}
            onClose={() => setShowPanel(false)}
          />
        )}
      </div>

      {/* Toast de desfazer */}
      <UndoToast
        item={undoItem}
        onUndo={handleUndo}
        onExpire={() => setUndoItem(null)}
      />
    </div>
  );
}

const EVENT_LABELS: Partial<Record<PlayEventType | string, string>> = {
  "2pt_made": "2pt ✓", "2pt_miss": "2pt ✗",
  "3pt_made": "3pt ✓", "3pt_miss": "3pt ✗",
  "ft_made":  "LL ✓",  "ft_miss":  "LL ✗",
  "rebound_off": "Res. Of.", "rebound_def": "Res. Def.",
  "assist": "Assist.", "steal": "Roubo", "block": "Desarme",
  "turnover": "Turnover", "foul_committed": "Falta",
};
