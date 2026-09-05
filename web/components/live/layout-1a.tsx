"use client";

import { useState } from "react";
import type { GameSession, PlayByPlay, PlayEventType } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import type { DerivedPlayerStats } from "@/lib/live/derive-stats";
import { formatClock } from "@/hooks/use-live-game";
import { MONO, SANS } from "./tokens";

// ── Types ────────────────────────────────────────────────────────────────────

type FoulType = "foul_def" | "foul_of" | "foul_tec" | "foul_anti";

export interface Layout1aProps {
  session: GameSession;
  roster: PlayerWithUser[];
  onCourt: PlayerWithUser[];
  bench: PlayerWithUser[];
  plays: PlayByPlay[];
  derivedStats: Map<string, DerivedPlayerStats>;
  clockSecs: number;
  recording: boolean;
  homeFouls: number;
  awayFouls: number;
  awayRebOff: number;
  awayRebDef: number;
  onRecordPlay: (eventType: PlayEventType, playerId: string) => Promise<boolean>;
  onRecordOpponentPoints: (pts: 1 | 2 | 3) => Promise<void>;
  onRecordOpponentFoul: (type: FoulType) => Promise<void>;
  onRecordOpponentReb: (type: "reb_off" | "reb_def") => Promise<void>;
  onStartClock: () => Promise<void>;
  onStopClock: () => Promise<void>;
  onNextPeriod: () => void;
  onSubstitute: (inId: string, outId: string) => Promise<void>;
  onSetLineup: (ids: string[]) => Promise<boolean>;
  onUndoPlay: (id: string) => Promise<boolean>;
}

// ── Event labels ──────────────────────────────────────────────────────────────

export const EVENT_LABELS: Record<string, string> = {
  "2pt_made": "Cesto de 2",          "2pt_miss": "Lançamento de 2 falhado",
  "3pt_made": "Cesto de 3",          "3pt_miss": "Lançamento de 3 falhado",
  "ft_made": "Lance livre convertido","ft_miss": "Lance livre falhado",
  "rebound_off": "Ressalto ofensivo", "rebound_def": "Ressalto defensivo",
  "assist": "Assistência",            "steal": "Roubo de bola",
  "block": "Bloco",                   "turnover": "Perda de bola",
  "foul_committed": "Falta",          "foul_drawn": "Falta sofrida",
  "foul_def": "Falta defensiva",      "foul_of": "Falta ofensiva",
  "foul_tec": "Falta técnica",        "foul_anti": "Falta antidesportiva",
  "substitution_in": "Entrou em campo","substitution_out": "Saiu para o banco",
  "timeout": "Timeout",               "period_end": "Fim do período",
  "game_start": "Início do jogo",     "game_end": "Fim do jogo",
};

// ── Action definitions ────────────────────────────────────────────────────────

interface ActionDef { event: PlayEventType; label: string; sub: string; style: "accent" | "neutral" | "danger"; }

const ACTIONS: ActionDef[] = [
  { event: "2pt_made",    label: "+2",           sub: "CONVERTIDO",         style: "accent"  },
  { event: "3pt_made",    label: "+3",           sub: "CONVERTIDO",         style: "accent"  },
  { event: "ft_made",     label: "+1",           sub: "LANCE LIVRE",        style: "accent"  },
  { event: "ft_miss",     label: "×1P",          sub: "LANCE LIVRE FALHADO",style: "neutral" },
  { event: "2pt_miss",    label: "×2P",          sub: "FALHADO",            style: "neutral" },
  { event: "3pt_miss",    label: "×3P",          sub: "FALHADO",            style: "neutral" },
  { event: "rebound_off", label: "RES OF.",      sub: "",                   style: "neutral" },
  { event: "rebound_def", label: "RES DEF.",     sub: "",                   style: "neutral" },
  { event: "assist",      label: "ASSIST.",      sub: "",                   style: "neutral" },
  { event: "steal",       label: "ROUBO",        sub: "",                   style: "neutral" },
  { event: "turnover",    label: "PERDA DE BOLA",sub: "",                   style: "neutral" },
  { event: "block",       label: "BLOCO",        sub: "",                   style: "neutral" },
  { event: "foul_def",    label: "F. DEF.",      sub: "FALTA",              style: "danger"  },
  { event: "foul_of",     label: "F. OF.",       sub: "FALTA",              style: "danger"  },
  { event: "foul_tec",    label: "TÉCNICA",      sub: "FALTA",              style: "danger"  },
  { event: "foul_anti",   label: "ANTIDESP.",    sub: "FALTA",              style: "danger"  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Pips({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{
          width: 30, height: 12, borderRadius: 6, display: "inline-block",
          background: i < count
            ? (count >= 4 ? "var(--danger)" : "var(--accent)")
            : "var(--dim)",
        }} />
      ))}
    </div>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
        {children}
      </span>
      {right && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS }}>{right}</span>}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--line)",
      borderRadius: 16, padding: "12px 18px", ...style,
    }}>
      {children}
    </div>
  );
}

// ── Scoreboard (1a variant — two panels) ──────────────────────────────────────

function Scoreboard1a({
  session, clockSecs, homeFouls, awayFouls, awayRebOff, awayRebDef,
  onStartClock, onStopClock, onNextPeriod,
}: {
  session: GameSession; clockSecs: number; homeFouls: number; awayFouls: number;
  awayRebOff: number; awayRebDef: number;
  onStartClock: () => void; onStopClock: () => void; onNextPeriod: () => void;
}) {
  const running = session.clock_running;
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {/* Score panel */}
      <Panel style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
              CD PÓVOA
            </span>
            <span style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>
              {session.home_score}
            </span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: "var(--muted)", paddingBottom: 6 }}>:</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
              PT (ADV.)
            </span>
            <span style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>
              {session.away_score}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--muted)", fontFamily: SANS }}>
              ADV. RESSALTOS {awayRebOff + awayRebDef}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: awayFouls >= 4 ? "var(--danger)" : "var(--muted)", fontFamily: SANS }}>
              FALTAS {awayFouls}/5
            </span>
          </div>
        </div>
      </Panel>

      {/* Clock panel */}
      <Panel style={{ minWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
            {session.current_period}º PERÍODO
          </span>
          <span style={{
            fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "2px 8px",
            background: "var(--accentSoft)", color: "var(--accent)", letterSpacing: "0.08em",
            fontFamily: SANS,
          }}>
            ● AO VIVO
          </span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>
          {formatClock(clockSecs)}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={running ? onStopClock : onStartClock}
            style={{
              flex: 1, height: 46, borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: SANS, fontSize: 14, fontWeight: 700,
              background: "var(--accent)", color: "var(--accentInk)",
            }}
          >
            {running ? "■ Parar" : "▶ Iniciar"}
          </button>
          <button
            onClick={onNextPeriod}
            style={{
              height: 46, padding: "0 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: SANS, fontSize: 14, fontWeight: 700,
              background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)",
            }}
          >
            Período +
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
            FALTAS DE EQUIPA {homeFouls}/5
          </span>
          <Pips count={homeFouls} />
        </div>
      </Panel>
    </div>
  );
}

// ── Opponent bar ───────────────────────────────────────────────────────────────

function OpponentBar({
  session, awayFouls, awayRebOff, awayRebDef, recording,
  onRecordOpponentPoints, onRecordOpponentFoul, onRecordOpponentReb,
}: {
  session: GameSession; awayFouls: number; awayRebOff: number; awayRebDef: number; recording: boolean;
  onRecordOpponentPoints: (pts: 1|2|3) => void;
  onRecordOpponentFoul: (type: FoulType) => void;
  onRecordOpponentReb: (type: "reb_off"|"reb_def") => void;
}) {
  const btnBase: React.CSSProperties = {
    fontFamily: SANS, fontWeight: 800, fontSize: 13, height: 46, borderRadius: 10,
    border: "1px solid var(--line)", cursor: "pointer", transition: "opacity 0.1s",
    background: "var(--chip)", color: "var(--text)",
  };
  const dangerBtn: React.CSSProperties = {
    ...btnBase,
    background: "var(--dangerSoft)", color: "var(--danger)", borderColor: "var(--danger)",
  };
  const accentBtn: React.CSSProperties = {
    ...btnBase, minWidth: 56,
    background: "var(--chip)", color: "var(--text)",
  };

  return (
    <Panel>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
        {/* Title */}
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text)", fontFamily: SANS }}>
            ADVERSÁRIO · PT
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS, marginTop: 2 }}>
            {session.away_score} no jogo · sem registo individual
          </div>
        </div>

        {/* Points */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>PONTOS</span>
          <div style={{ display: "flex", gap: 6 }}>
            {([1, 2, 3] as const).map(pts => (
              <button key={pts} onClick={() => onRecordOpponentPoints(pts)} disabled={recording}
                style={{ ...accentBtn, width: 48 }}>+{pts}</button>
            ))}
          </div>
        </div>

        {/* Rebounds */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>RESSALTOS</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onRecordOpponentReb("reb_off")} disabled={recording}
              style={{ ...btnBase, padding: "0 12px" }}>RES OF.</button>
            <button onClick={() => onRecordOpponentReb("reb_def")} disabled={recording}
              style={{ ...btnBase, padding: "0 12px" }}>RES DEF.</button>
          </div>
        </div>

        {/* Opponent fouls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>FALTAS DO ADVERSÁRIO</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["foul_def","foul_of","foul_tec","foul_anti"] as FoulType[]).map((t, i) => (
              <button key={t} onClick={() => onRecordOpponentFoul(t)} disabled={recording}
                style={{ ...dangerBtn, padding: "0 12px" }}>
                {["DEFENSIVA","OFENSIVA","TÉCNICA","ANTIDESP."][i]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Pips */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
            FALTAS DE EQUIPA {awayFouls}/5
          </span>
          <Pips count={awayFouls} />
        </div>
      </div>
    </Panel>
  );
}

// ── Action Panel ───────────────────────────────────────────────────────────────

function ActionPanel({
  player, recording,
  onAction,
}: {
  player: PlayerWithUser | null;
  recording: boolean;
  onAction: (event: PlayEventType) => void;
}) {
  const btnStyle = (style: "accent" | "neutral" | "danger"): React.CSSProperties => ({
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, height: 56, borderRadius: 10, border: "1px solid",
    cursor: player ? "pointer" : "default", fontFamily: SANS,
    opacity: player ? 1 : 0.35, transition: "opacity 0.1s",
    ...(style === "accent" ? {
      background: "var(--accentSoft)", borderColor: "var(--accent)", color: "var(--accent)",
    } : style === "danger" ? {
      background: "var(--dangerSoft)", borderColor: "var(--danger)", color: "var(--danger)",
    } : {
      background: "var(--chip)", borderColor: "var(--line)", color: "var(--text)",
    }),
  });

  return (
    <div style={{
      width: 330, flexShrink: 0,
      background: "var(--panel)", border: "1px solid var(--line)",
      borderRadius: 16, padding: 14,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* Header */}
      {player ? (
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
          <span style={{ fontFamily: MONO, color: "var(--muted)" }}>#{player.jersey_number}</span>
          {" "}{player.user.name}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: SANS }}>
            — Nenhum jogador selecionado
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS }}>
            Toca num jogador em campo
          </span>
        </div>
      )}

      {/* 2-column grid of action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.event}
            disabled={!player || recording}
            onClick={() => player && onAction(a.event)}
            style={btnStyle(a.style)}
          >
            <span style={{ fontSize: 14, fontWeight: 800 }}>{a.label}</span>
            {a.sub && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", opacity: 0.7 }}>{a.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Play Log ───────────────────────────────────────────────────────────────────

function PlayLog({
  plays, roster, recording, onUndoPlay,
}: {
  plays: PlayByPlay[];
  roster: PlayerWithUser[];
  recording: boolean;
  onUndoPlay: (id: string) => void;
}) {
  const visible = plays.slice(0, 4);
  const UNUNDOABLE = ["game_start", "period_end", "game_end", "substitution_in"];

  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--line)",
      borderRadius: 16, padding: "10px 18px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", fontFamily: SANS }}>
          REGISTADO AGORA · {plays.length} registos
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: SANS }}>
          Toca no × para apagar qualquer registo
        </span>
      </div>
      {visible.length === 0 && (
        <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: SANS }}>Sem registos</span>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((p) => {
          const player = roster.find((r) => r.user_id === p.player_id);
          const label = EVENT_LABELS[p.event_type] ?? p.event_type;
          const undoable = !UNUNDOABLE.includes(p.event_type);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--muted)", minWidth: 50 }}>
                {p.game_clock || "—"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1, fontFamily: SANS }}>
                {!p.is_home_team && <span style={{ color: "var(--muted)" }}>Adversário · </span>}
                {player && <span>#{player.jersey_number} {player.user.name.split(" ")[0]} · </span>}
                {label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", minWidth: 60, textAlign: "right" }}>
                {p.home_score_after}–{p.away_score_after}
              </span>
              {undoable ? (
                <button
                  disabled={recording}
                  onClick={() => onUndoPlay(String(p.id))}
                  style={{
                    width: 34, height: 34, borderRadius: 9,
                    border: "1px solid var(--danger)", background: "var(--dangerSoft)",
                    color: "var(--danger)", cursor: "pointer", fontSize: 16, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              ) : (
                <span style={{ width: 34, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Layout 1a ────────────────────────────────────────────────────────────

export function Layout1a({
  session, roster, onCourt, bench, plays, derivedStats, clockSecs, recording,
  homeFouls, awayFouls, awayRebOff, awayRebDef,
  onRecordPlay, onRecordOpponentPoints, onRecordOpponentFoul, onRecordOpponentReb,
  onStartClock, onStopClock, onNextPeriod, onSubstitute, onSetLineup, onUndoPlay,
}: Layout1aProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithUser | null>(null);
  const [pendingIn, setPendingIn] = useState<string | null>(null);

  function getStats(pid: string) { return derivedStats.get(pid); }

  async function handleCourtTap(player: PlayerWithUser) {
    if (pendingIn) {
      // Execute substitution: pendingIn comes in, this player goes out
      await onSubstitute(pendingIn, player.user_id);
      setPendingIn(null);
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer((prev) => prev?.user_id === player.user_id ? null : player);
    }
  }

  async function handleBenchTap(player: PlayerWithUser) {
    if (onCourt.length < 5) {
      // Direct entry: add to lineup
      await onSetLineup([...onCourt.map((p) => p.user_id), player.user_id]);
    } else {
      setPendingIn((prev) => prev === player.user_id ? null : player.user_id);
    }
    setSelectedPlayer(null);
  }

  async function handleAction(event: PlayEventType) {
    if (!selectedPlayer) return;
    await onRecordPlay(event, selectedPlayer.user_id);
    setSelectedPlayer(null);
  }

  const playerCardStyle = (p: PlayerWithUser): React.CSSProperties => {
    const isSelected = selectedPlayer?.user_id === p.user_id;
    const isSubTarget = !!pendingIn && onCourt.some((c) => c.user_id === p.user_id);
    return {
      display: "flex", flexDirection: "column", gap: 8,
      padding: "12px 14px", borderRadius: 14, minHeight: 104, width: "100%",
      textAlign: "left", cursor: "pointer", transition: "all 0.12s",
      background: isSelected ? "var(--accentSoft)" : "var(--panel)",
      border: isSelected
        ? "2px solid var(--accent)"
        : isSubTarget
        ? "2px dashed var(--accent)"
        : "2px solid var(--line)",
      boxShadow: isSelected ? "0 0 0 3px oklch(0.5 0.14 150 / 0.2)" : undefined,
    };
  };

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, fontFamily: SANS }}>

      {/* Scoreboard */}
      <Scoreboard1a
        session={session} clockSecs={clockSecs} homeFouls={homeFouls}
        awayFouls={awayFouls} awayRebOff={awayRebOff} awayRebDef={awayRebDef}
        onStartClock={onStartClock} onStopClock={onStopClock} onNextPeriod={onNextPeriod}
      />

      {/* Opponent bar */}
      <OpponentBar
        session={session} awayFouls={awayFouls} awayRebOff={awayRebOff} awayRebDef={awayRebDef}
        recording={recording}
        onRecordOpponentPoints={onRecordOpponentPoints}
        onRecordOpponentFoul={onRecordOpponentFoul}
        onRecordOpponentReb={onRecordOpponentReb}
      />

      {/* EM CAMPO section */}
      <div>
        <SectionLabel
          right={pendingIn
            ? "Toca num jogador em campo para substituir"
            : "1 · toca no jogador → 2 · toca na ação"}
        >
          EM CAMPO · {onCourt.length}/5 em campo
        </SectionLabel>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Player cards + bench */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Court players grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {onCourt.map((player) => {
                const stats = getStats(player.user_id);
                const fouls = stats?.fouls_total ?? 0;
                const pts = stats?.pts ?? 0;
                const reb = (stats?.reb_off ?? 0) + (stats?.reb_def ?? 0);
                const ast = stats?.ast ?? 0;
                return (
                  <button key={player.user_id} onClick={() => handleCourtTap(player)}
                    style={playerCardStyle(player)}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "var(--muted)" }}>
                        #{player.jersey_number ?? "–"}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                        {player.user.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      {[["PTS", pts], ["RES", reb], ["AST", ast], ["FALT", fouls]].map(([lbl, val]) => (
                        <div key={lbl as string} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)" }}>{lbl}</span>
                          <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1,2,3,4,5].map((i) => (
                        <span key={i} style={{
                          width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                          background: i <= fouls
                            ? (fouls >= 4 ? "var(--danger)" : "var(--accent)")
                            : "var(--dim)",
                        }} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bench */}
            {bench.length > 0 && (
              <div>
                <SectionLabel right="Toca num jogador do banco para o fazer entrar">
                  BANCO · SUBSTITUIÇÕES
                </SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {bench.map((player) => {
                    const stats = getStats(player.user_id);
                    const isPendingIn = pendingIn === player.user_id;
                    return (
                      <button
                        key={player.user_id}
                        onClick={() => handleBenchTap(player)}
                        style={{
                          fontFamily: SANS, fontSize: 13, fontWeight: 600,
                          padding: "8px 16px", borderRadius: 999, cursor: "pointer",
                          background: "var(--chip)", color: "var(--text)",
                          border: isPendingIn
                            ? "2px solid var(--accent)"
                            : "1px solid var(--line)",
                          transition: "all 0.1s",
                        }}
                      >
                        #{player.jersey_number} {player.user.name.split(" ")[0]}{" "}
                        {stats?.pts ?? 0} pts · {stats?.fouls_total ?? 0} F ↑
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action panel */}
          <ActionPanel
            player={selectedPlayer}
            recording={recording}
            onAction={handleAction}
          />
        </div>
      </div>

      {/* Play log */}
      <PlayLog plays={plays} roster={roster} recording={recording} onUndoPlay={onUndoPlay} />
    </div>
  );
}
