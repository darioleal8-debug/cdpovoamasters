"use client";

import { useState } from "react";
import type { GameSession, PlayByPlay, PlayEventType } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import type { DerivedPlayerStats } from "@/lib/live/derive-stats";
import { formatClock } from "@/hooks/use-live-game";
import { EVENT_LABELS } from "./layout-1a";
import { MONO, SANS } from "./tokens";

type FoulType = "foul_def" | "foul_of" | "foul_tec" | "foul_anti";
type FoulSel = "Def" | "Of" | "Tec" | "Anti";

export interface Layout1cProps {
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

const FOUL_SEL_OPTIONS: { id: FoulSel; label: string; event: FoulType }[] = [
  { id: "Def",  label: "DEFENSIVA", event: "foul_def"  },
  { id: "Of",   label: "OFENSIVA",  event: "foul_of"   },
  { id: "Tec",  label: "TÉCNICA",   event: "foul_tec"  },
  { id: "Anti", label: "ANTIDESP.", event: "foul_anti" },
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

export function Layout1c({
  session, roster, onCourt, bench, plays, derivedStats, clockSecs, recording,
  homeFouls, awayFouls, awayRebOff, awayRebDef,
  onRecordPlay, onRecordOpponentPoints, onRecordOpponentFoul, onRecordOpponentReb,
  onStartClock, onStopClock, onNextPeriod, onSubstitute, onSetLineup, onUndoPlay,
}: Layout1cProps) {
  const [foulSel, setFoulSel] = useState<FoulSel>("Def");

  const running = session.clock_running;
  const UNUNDOABLE = ["game_start", "period_end", "game_end", "substitution_in"];

  function getStats(pid: string) { return derivedStats.get(pid); }

  function currentFoulEvent(): FoulType {
    return FOUL_SEL_OPTIONS.find((f) => f.id === foulSel)!.event;
  }

  async function handleSub(player: PlayerWithUser) {
    const isOnCourt = onCourt.some((p) => p.user_id === player.user_id);
    if (isOnCourt) {
      // Move to bench
      await onSetLineup(onCourt.filter((p) => p.user_id !== player.user_id).map((p) => p.user_id));
    } else {
      if (onCourt.length < 5) {
        await onSetLineup([...onCourt.map((p) => p.user_id), player.user_id]);
      }
      // If court full, do nothing (user needs to remove someone first)
    }
  }

  // Ordered: onCourt first, then bench
  const orderedRoster = [
    ...roster.filter((p) => onCourt.some((c) => c.user_id === p.user_id)),
    ...roster.filter((p) => !onCourt.some((c) => c.user_id === p.user_id)),
  ];

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, fontFamily: SANS }}>

      {/* Compact scoreboard */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: "12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>PÓVOA · PT</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>ADV. RES {awayRebOff + awayRebDef} · FALTAS {awayFouls}/5</div>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, color: "var(--text)" }}>{session.home_score}</span>
            <span style={{ fontFamily: MONO, fontSize: 24, color: "var(--muted)" }}>:</span>
            <span style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, color: "var(--text)" }}>{session.away_score}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>{session.current_period}º PERÍODO</span>
            <span style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, color: "var(--text)" }}>{formatClock(clockSecs)}</span>
          </div>

          <button onClick={running ? onStopClock : onStartClock}
            style={{ height: 46, padding: "0 20px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 700, background: "var(--accent)", color: "var(--accentInk)" }}>
            {running ? "■ Parar" : "▶ Iniciar"}
          </button>
          <button onClick={onNextPeriod}
            style={{ height: 46, padding: "0 16px", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 700, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}>
            Período +
          </button>

          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>FALTAS DE EQUIPA {homeFouls}/5</span>
            <Pips count={homeFouls} />
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

      {/* Foul type selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          TIPO DE FALTA A REGISTAR NA FOLHA
        </span>
        {FOUL_SEL_OPTIONS.map((f) => (
          <button key={f.id} onClick={() => setFoulSel(f.id)}
            style={{
              height: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 700, border: "1px solid",
              background: foulSel === f.id ? "var(--danger)" : "var(--chip)",
              borderColor: foulSel === f.id ? "var(--danger)" : "var(--line)",
              color: foulSel === f.id ? "var(--bg)" : "var(--text)",
              transition: "all 0.1s",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "196px repeat(3, 0.85fr) 1.5fr 0.95fr 0.95fr 0.95fr 70px",
          gap: 8, padding: "0 8px 6px 8px",
          fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)",
          textTransform: "uppercase", fontFamily: SANS, minWidth: 900,
        }}>
          <span>JOGADOR</span>
          <span style={{ textAlign: "center" }}>1 PONTO</span>
          <span style={{ textAlign: "center" }}>2 PONTOS</span>
          <span style={{ textAlign: "center" }}>3 PONTOS</span>
          <span style={{ textAlign: "center" }}>FALHOU 1P/2P/3P</span>
          <span style={{ textAlign: "center" }}>RESSALTO</span>
          <span style={{ textAlign: "center" }}>ASSIST.</span>
          <span style={{ textAlign: "center" }}>FALTA {FOUL_SEL_OPTIONS.find(f => f.id === foulSel)?.label}</span>
          <span style={{ textAlign: "right" }}>TOTAL</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 900 }}>
          {orderedRoster.map((player) => {
            const isOnCourt = onCourt.some((c) => c.user_id === player.user_id);
            const stats = getStats(player.user_id);
            const fouls = stats?.fouls_total ?? 0;
            const pts = stats?.pts ?? 0;
            const reb = (stats?.reb_off ?? 0) + (stats?.reb_def ?? 0);
            const ast = stats?.ast ?? 0;

            const rowStyle: React.CSSProperties = {
              display: "grid",
              gridTemplateColumns: "196px repeat(3, 0.85fr) 1.5fr 0.95fr 0.95fr 0.95fr 70px",
              gap: 8, padding: "8px", borderRadius: 14, alignItems: "center",
              background: isOnCourt ? "var(--panel)" : "transparent",
              border: isOnCourt ? "1px solid var(--line)" : "1px dashed var(--line)",
              opacity: isOnCourt ? 1 : 0.72,
            };

            const accentCellBtn: React.CSSProperties = {
              height: 52, borderRadius: 10, border: "1px solid var(--accent)",
              background: "var(--accentSoft)", color: "var(--accent)",
              fontFamily: SANS, fontSize: 17, fontWeight: 800,
              cursor: "pointer", width: "100%",
            };

            const missCellBtn: React.CSSProperties = {
              height: 52, borderRadius: 10, border: "1px solid var(--line)",
              background: "var(--chip)", color: "var(--text)",
              fontFamily: SANS, fontSize: 14, fontWeight: 700,
              cursor: "pointer", flex: 1,
            };

            const dangerCellBtn: React.CSSProperties = {
              height: 52, borderRadius: 10, border: "1px solid var(--danger)",
              background: "var(--dangerSoft)", color: "var(--danger)",
              fontFamily: SANS, fontSize: 14, fontWeight: 800,
              cursor: "pointer", width: "100%",
            };

            const neutralCellBtn: React.CSSProperties = {
              height: 52, borderRadius: 10, border: "1px solid var(--line)",
              background: "var(--chip)", color: "var(--text)",
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
              cursor: "pointer", width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
            };

            return (
              <div key={player.user_id} style={rowStyle}>
                {/* Player cell */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "var(--muted)" }}>
                      #{player.jersey_number ?? "–"}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                      {player.user.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleSub(player)}
                    style={{
                      alignSelf: "flex-start", fontSize: 10, fontWeight: 800, borderRadius: 999,
                      padding: "5px 10px", cursor: "pointer", border: "none",
                      background: isOnCourt ? "var(--accentSoft)" : "var(--chip)",
                      color: isOnCourt ? "var(--accent)" : "var(--muted)",
                      fontFamily: SANS, letterSpacing: "0.05em",
                    }}
                  >
                    {isOnCourt ? "EM CAMPO ↓" : "BANCO ↑"}
                  </button>
                </div>

                {/* +1 */}
                <button disabled={recording} onClick={() => onRecordPlay("ft_made", player.user_id)}
                  style={accentCellBtn}>+1</button>

                {/* +2 */}
                <button disabled={recording} onClick={() => onRecordPlay("2pt_made", player.user_id)}
                  style={accentCellBtn}>+2</button>

                {/* +3 */}
                <button disabled={recording} onClick={() => onRecordPlay("3pt_made", player.user_id)}
                  style={accentCellBtn}>+3</button>

                {/* Miss 1P / 2P / 3P */}
                <div style={{ display: "flex", gap: 4 }}>
                  {(["ft_miss","2pt_miss","3pt_miss"] as PlayEventType[]).map((ev, i) => (
                    <button key={ev} disabled={recording} onClick={() => onRecordPlay(ev, player.user_id)}
                      style={missCellBtn}>
                      ✕{i + 1}
                    </button>
                  ))}
                </div>

                {/* Rebounds */}
                <button disabled={recording}
                  onClick={() => onRecordPlay("rebound_off", player.user_id)}
                  style={neutralCellBtn}>
                  RES {reb}
                </button>

                {/* Assist */}
                <button disabled={recording}
                  onClick={() => onRecordPlay("assist", player.user_id)}
                  style={neutralCellBtn}>
                  AST {ast}
                </button>

                {/* Foul */}
                <button disabled={recording}
                  onClick={() => onRecordPlay(currentFoulEvent(), player.user_id)}
                  style={dangerCellBtn}>
                  F {fouls}
                </button>

                {/* Total */}
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, textAlign: "right", color: "var(--text)" }}>
                  {pts}
                </span>
              </div>
            );
          })}
        </div>
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
