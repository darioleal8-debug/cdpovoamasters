"use client";

import { useState } from "react";
import type { GameSession, PlayByPlay, PlayEventType } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import type { DerivedPlayerStats } from "@/lib/live/derive-stats";
import { formatClock } from "@/hooks/use-live-game";
import { EVENT_LABELS } from "./layout-1a";
import { MONO, SANS } from "./tokens";

type FoulType = "foul_def" | "foul_of" | "foul_tec" | "foul_anti";

export interface Layout1bProps {
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

function Pips({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{
          width: 30, height: 12, borderRadius: 6, display: "inline-block",
          background: i < count ? (count >= 4 ? "var(--danger)" : "var(--accent)") : "var(--dim)",
        }} />
      ))}
    </div>
  );
}

export function Layout1b({
  session, roster, onCourt, bench, plays, derivedStats, clockSecs, recording,
  homeFouls, awayFouls, awayRebOff, awayRebDef,
  onRecordPlay, onRecordOpponentPoints, onRecordOpponentFoul, onRecordOpponentReb,
  onStartClock, onStopClock, onNextPeriod, onSubstitute, onSetLineup, onUndoPlay,
}: Layout1bProps) {
  const [selectedAction, setSelectedAction] = useState<PlayEventType | null>(null);
  const [pendingIn, setPendingIn] = useState<string | null>(null);

  const running = session.clock_running;

  function getStats(pid: string) { return derivedStats.get(pid); }

  async function handlePlayerTap(player: PlayerWithUser) {
    const isOnCourt = onCourt.some((p) => p.user_id === player.user_id);

    if (pendingIn) {
      if (isOnCourt) {
        await onSubstitute(pendingIn, player.user_id);
        setPendingIn(null);
      }
      return;
    }

    if (!isOnCourt) {
      // bench tap
      if (onCourt.length < 5) {
        await onSetLineup([...onCourt.map((p) => p.user_id), player.user_id]);
      } else {
        setPendingIn((prev) => prev === player.user_id ? null : player.user_id);
      }
      return;
    }

    if (!selectedAction) return;
    await onRecordPlay(selectedAction, player.user_id);
    setSelectedAction(null);
  }

  const actionBtnStyle = (a: ActionDef): React.CSSProperties => {
    const active = selectedAction === a.event;
    return {
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 2, height: 62, borderRadius: 10, border: "1px solid", cursor: "pointer",
      fontFamily: SANS, transition: "all 0.1s",
      ...(a.style === "accent" ? {
        background: active ? "var(--accent)" : "var(--accentSoft)",
        borderColor: "var(--accent)",
        color: active ? "var(--accentInk)" : "var(--accent)",
      } : a.style === "danger" ? {
        background: active ? "var(--danger)" : "var(--dangerSoft)",
        borderColor: "var(--danger)",
        color: active ? "var(--accentInk)" : "var(--danger)",
      } : {
        background: active ? "var(--text)" : "var(--chip)",
        borderColor: active ? "var(--text)" : "var(--line)",
        color: active ? "var(--bg)" : "var(--text)",
      }),
    };
  };

  const UNUNDOABLE = ["game_start", "period_end", "game_end", "substitution_in"];

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, fontFamily: SANS }}>

      {/* Compact scoreboard */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: "12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* Scores */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>PÓVOA</span>
              <span style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>{session.home_score}</span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 24, color: "var(--muted)", alignSelf: "flex-end", paddingBottom: 4 }}>:</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>PT</span>
              <span style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>{session.away_score}</span>
            </div>
          </div>

          {/* Period + Clock */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>{session.current_period}º PERÍODO</span>
            <span style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>{formatClock(clockSecs)}</span>
          </div>

          {/* Clock controls */}
          <button onClick={running ? onStopClock : onStartClock}
            style={{ height: 46, padding: "0 20px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 700, background: "var(--accent)", color: "var(--accentInk)" }}>
            {running ? "■ Parar" : "▶ Iniciar"}
          </button>
          <button onClick={onNextPeriod}
            style={{ height: 46, padding: "0 16px", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 700, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}>
            Período +
          </button>

          <div style={{ flex: 1 }} />

          {/* Team fouls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>FALTAS DE EQUIPA {homeFouls}/5</span>
            <Pips count={homeFouls} />
          </div>

          {/* Opponent compact */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>ADV. RES {awayRebOff + awayRebDef}</span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: awayFouls >= 4 ? "var(--danger)" : "var(--muted)", textTransform: "uppercase" }}>ADV. FALTAS {awayFouls}/5</span>
          </div>
        </div>
      </div>

      {/* Opponent bar */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: "12px 18px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text)" }}>ADVERSÁRIO · PT</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{session.away_score} no jogo · sem registo individual</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>PONTOS</span>
            <div style={{ display: "flex", gap: 6 }}>
              {([1,2,3] as const).map(pts => (
                <button key={pts} onClick={() => onRecordOpponentPoints(pts)} disabled={recording}
                  style={{ width: 48, height: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--chip)", color: "var(--text)", fontFamily: SANS, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  +{pts}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>RESSALTOS</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["reb_off","reb_def"] as const).map((t, i) => (
                <button key={t} onClick={() => onRecordOpponentReb(t)} disabled={recording}
                  style={{ padding: "0 12px", height: 46, borderRadius: 10, border: "1px solid var(--line)", background: "var(--chip)", color: "var(--text)", fontFamily: SANS, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  {["RES OF.","RES DEF."][i]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>FALTAS DO ADVERSÁRIO</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["foul_def","foul_of","foul_tec","foul_anti"] as FoulType[]).map((t, i) => (
                <button key={t} onClick={() => onRecordOpponentFoul(t)} disabled={recording}
                  style={{ padding: "0 12px", height: 46, borderRadius: 10, border: "1px solid var(--danger)", background: "var(--dangerSoft)", color: "var(--danger)", fontFamily: SANS, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  {["DEFENSIVA","OFENSIVA","TÉCNICA","ANTIDESP."][i]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>FALTAS DE EQUIPA {awayFouls}/5</span>
            <Pips count={awayFouls} />
          </div>
        </div>
      </div>

      {/* Action grid — 6 cols for rows 1+2, 4 cols for fouls */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
          1 · QUE ACONTECEU?{" "}
          <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
            (faltas: def., of., técnica, antidesportiva)
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {ACTIONS.filter(a => a.style !== "danger").map((a) => (
            <button key={a.event}
              onClick={() => setSelectedAction(prev => prev === a.event ? null : a.event)}
              style={actionBtnStyle(a)}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{a.label}</span>
              {a.sub && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", opacity: 0.75 }}>{a.sub}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6 }}>
          {ACTIONS.filter(a => a.style === "danger").map((a) => (
            <button key={a.event}
              onClick={() => setSelectedAction(prev => prev === a.event ? null : a.event)}
              style={actionBtnStyle(a)}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{a.label}</span>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", opacity: 0.75 }}>{a.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Player row */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
          2 · DE QUEM?{" "}
          <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
            {selectedAction ? "" : "Escolhe primeiro a ação acima"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {onCourt.map((player) => {
            const stats = getStats(player.user_id);
            const fouls = stats?.fouls_total ?? 0;
            const pts = stats?.pts ?? 0;
            const reb = (stats?.reb_off ?? 0) + (stats?.reb_def ?? 0);
            const isPending = pendingIn ? onCourt.some(c => c.user_id === player.user_id) : false;
            return (
              <button key={player.user_id} onClick={() => handlePlayerTap(player)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  minWidth: 120, minHeight: 118, padding: "12px 10px", borderRadius: 14,
                  border: isPending ? "2px dashed var(--accent)" : "2px solid var(--line)",
                  background: "var(--panel)", cursor: selectedAction ? "pointer" : "default",
                  opacity: selectedAction || pendingIn ? 1 : 0.6,
                  transition: "all 0.1s", fontFamily: SANS,
                }}>
                <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: "var(--muted)" }}>
                  #{player.jersey_number ?? "–"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textAlign: "center" }}>
                  {player.user.name.split(" ")[0]}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{pts} pts · {reb} res</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {[1,2,3,4,5].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                      background: i <= fouls ? (fouls >= 4 ? "var(--danger)" : "var(--accent)") : "var(--dim)",
                    }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Bench */}
        {bench.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>BANCO</span>
            {bench.map((player) => {
              const stats = getStats(player.user_id);
              const isPendingIn = pendingIn === player.user_id;
              return (
                <button key={player.user_id} onClick={() => handlePlayerTap(player)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999, cursor: "pointer",
                    background: "var(--chip)", color: "var(--text)", fontFamily: SANS,
                    border: isPendingIn ? "2px solid var(--accent)" : "1px solid var(--line)",
                  }}>
                  #{player.jersey_number} {player.user.name.split(" ")[0]} ↑
                </button>
              );
            })}
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
              Toca num jogador do banco para o fazer entrar
            </span>
          </div>
        )}
      </div>

      {/* Play log */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: "10px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>
            REGISTADO AGORA · {plays.length} registos
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Toca no × para apagar qualquer registo</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {plays.slice(0, 4).map((p) => {
            const player = roster.find((r) => r.user_id === p.player_id);
            const label = EVENT_LABELS[p.event_type] ?? p.event_type;
            const undoable = !UNUNDOABLE.includes(p.event_type);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--muted)", minWidth: 50 }}>{p.game_clock || "—"}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 }}>
                  {!p.is_home_team && <span style={{ color: "var(--muted)" }}>Adversário · </span>}
                  {player && <span>#{player.jersey_number} {player.user.name.split(" ")[0]} · </span>}
                  {label}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", minWidth: 60, textAlign: "right" }}>
                  {p.home_score_after}–{p.away_score_after}
                </span>
                {undoable ? (
                  <button disabled={recording} onClick={() => onUndoPlay(String(p.id))}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid var(--danger)", background: "var(--dangerSoft)", color: "var(--danger)", cursor: "pointer", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    ×
                  </button>
                ) : <span style={{ width: 34, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
