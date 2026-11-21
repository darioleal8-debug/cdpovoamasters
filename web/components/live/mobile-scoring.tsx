"use client";

import { useState, useMemo } from "react";
import type { PlayEventType, PlayByPlay, GameSession } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import { deriveStats, withSecondsPlayed } from "@/lib/live/derive-stats";
import { computeSecondsPlayed, formatMinutes, type CourtStint } from "@/lib/live/minutes";
import { formatClock } from "@/hooks/use-live-game";
import { MONO, SANS } from "./tokens";
import { PeriodBar } from "@/components/live/period-bar";
import { liveName } from "@/lib/live/player-name";
import { clockButtonColors } from "@/lib/live/clock-button";

// ── Types ─────────────────────────────────────────────────────────────────────

type FoulType = "foul_def" | "foul_of" | "foul_tec" | "foul_anti";
type ActionStyle = "accent" | "neutral" | "danger";

interface LiveGameHandle {
  session: GameSession | null;
  roster: PlayerWithUser[];
  onCourt: PlayerWithUser[];
  bench: PlayerWithUser[];
  plays: PlayByPlay[];
  stints: CourtStint[];
  clockSecs: number;
  recording: boolean;
  recordPlay: (args: { event_type: PlayEventType; player_id: string }) => Promise<boolean>;
  recordOpponentPoints: (pts: 1 | 2 | 3) => Promise<void>;
  recordOpponentMiss: (pts: 1 | 2 | 3) => Promise<void>;
  recordOpponentFoul: (type: FoulType) => Promise<void>;
  recordOpponentReb: (type: "reb_off" | "reb_def") => Promise<void>;
  startClock: () => Promise<void>;
  stopClock: () => Promise<void>;
  substitutePlayer: (inId: string, outId: string) => Promise<void>;
  setLineup: (ids: string[]) => Promise<boolean>;
  undoPlay: (id: string) => Promise<boolean>;
  callTimeout?: (team: "home" | "away") => Promise<void>;
}

export interface MobileScoringScreenProps {
  game: LiveGameHandle;
  userId: string;
  /** Name of the club using the scorer (never hard-coded). */
  clubName?: string;
  /** Fim de período / fim de jogo: abrem os diálogos da página (iguais aos do ecrã normal). */
  onNextPeriod?: () => void;
  onFinish?: () => void;
  /** Abre o tutorial do live (janela da página). */
  onOpenTutorial?: () => void;
}

// ── Module-level constants ────────────────────────────────────────────────────

const SCORE_ACTIONS: Array<{ event: PlayEventType; label: string; sub: string; style: ActionStyle }> = [
  { event: "2pt_made", label: "+2", sub: "MADE",  style: "accent"  },
  { event: "3pt_made", label: "+3", sub: "MADE",  style: "accent"  },
  { event: "ft_made",  label: "+1", sub: "FT",    style: "accent"  },
  { event: "2pt_miss", label: "×2", sub: "MISS",  style: "neutral" },
  { event: "3pt_miss", label: "×3", sub: "MISS",  style: "neutral" },
  { event: "ft_miss",  label: "×1", sub: "FT MISS", style: "neutral" },
];

const STAT_ACTIONS: Array<{ event: PlayEventType; label: string; style: ActionStyle }> = [
  { event: "rebound_off", label: "OFF REB", style: "neutral" },
  { event: "rebound_def", label: "DEF REB", style: "neutral" },
  { event: "steal",       label: "STEAL",  style: "neutral" },
  { event: "turnover",    label: "TOV",  style: "neutral" },
  { event: "block",       label: "BLOCK",  style: "neutral" },
];

const FOUL_ACTIONS: Array<{ event: PlayEventType; label: string; style: ActionStyle }> = [
  { event: "foul_def",  label: "DEF.",  style: "danger" },
  { event: "foul_of",   label: "OFF.",   style: "danger" },
  { event: "foul_tec",  label: "TECH.",  style: "danger" },
  { event: "foul_anti", label: "UNSP.", style: "danger" },
  { event: "foul_drawn", label: "DRAWN", style: "neutral" },
];

const PLAY_LABELS: Record<string, string> = {
  "2pt_made": "+2 pts",       "2pt_miss": "×2 pts",
  "3pt_made": "+3 pts",       "3pt_miss": "×3 pts",
  "ft_made":  "+1 FT",       "ft_miss":  "×FT",
  "rebound_off": "Off. reb",  "rebound_def": "Def. reb",
  "assist": "Assist",       "steal": "Steal",
  "block": "Block",          "turnover": "Turnover",
  "foul_def": "Def. foul",     "foul_of": "Off. foul",
  "foul_tec": "Tech. foul",     "foul_anti": "Unsp. foul",
  "foul_drawn": "Foul drawn",
  "substitution_in": "In", "substitution_out": "Out",
  "period_end": "End period", "game_start": "Start",
};

const UNUNDOABLE = new Set<string>(); // every action can be undone

// ── Module-level sub-components ───────────────────────────────────────────────

interface PlayerRowProps {
  player: PlayerWithUser;
  pts: number;
  fouls: number;
  secs: number;
  isSelected: boolean;
  isSubTarget: boolean;
  isPendingIn: boolean;
  onClick: () => void;
}

function PlayerRow({ player, pts, fouls, secs, isSelected, isSubTarget, isPendingIn, onClick }: PlayerRowProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 10px", width: "100%", minHeight: 52,
        borderRadius: 9, cursor: "pointer", textAlign: "left",
        transition: "background 0.1s", fontFamily: SANS,
        background: isSelected ? "var(--accentSoft)" : "var(--panel)",
        border: `${isSelected ? 2 : 1}px ${isSubTarget && !isSelected ? "dashed" : "solid"} ${
          isSelected || isSubTarget ? "var(--accent)" : "var(--line)"
        }`,
      } as React.CSSProperties}
    >
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "var(--muted)", minWidth: 30 }}>
        {player.jersey_number ?? "–"}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {liveName(player.user.name)}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: "var(--muted)" }} title="Time played">{formatMinutes(secs)}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{pts}P</span>
        {fouls > 0 && (
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            color: fouls >= 4 ? "var(--danger)" : "var(--muted)",
            background: fouls >= 4 ? "var(--dangerSoft)" : "transparent",
            padding: "1px 4px", borderRadius: 4,
          }}>
            {fouls}F
          </span>
        )}
        {isPendingIn && (
          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.05em" }}>↑IN</span>
        )}
      </div>
    </button>
  );
}

interface ActionButtonProps {
  event: PlayEventType;
  label: string;
  sub?: string;
  actionStyle: ActionStyle;
  enabled: boolean;
  onClick: () => void;
}

function ActionButton({ event: _event, label, sub, actionStyle, enabled, onClick }: ActionButtonProps) {
  const [bg, borderColor, color] = actionStyle === "accent"
    ? ["var(--accentSoft)", "var(--accent)", "var(--accent)"]
    : actionStyle === "danger"
    ? ["var(--dangerSoft)", "var(--danger)", "var(--danger)"]
    : ["var(--chip)", "var(--line)", "var(--text)"];

  return (
    <button
      disabled={!enabled}
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 1, height: 44, borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: bg, color,
        cursor: enabled ? "pointer" : "default",
        opacity: enabled ? 1 : 0.3,
        transition: "opacity 0.1s",
        fontFamily: SANS,
      } as React.CSSProperties}
    >
      <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
      {sub && <span style={{ fontSize: 8, letterSpacing: "0.05em", opacity: 0.7 }}>{sub}</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileScoringScreen({ game, userId: _userId, clubName = "Home", onNextPeriod, onFinish, onOpenTutorial }: MobileScoringScreenProps) {
  const {
    session, roster, onCourt, bench, plays, stints, clockSecs, recording,
    recordPlay, recordOpponentPoints, recordOpponentMiss, recordOpponentFoul, recordOpponentReb,
    startClock, stopClock, substitutePlayer, setLineup, undoPlay, callTimeout,
  } = game;

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithUser | null>(null);
  const [pendingIn, setPendingIn] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<"banco" | "feed" | null>(null);
  const [showOpp, setShowOpp] = useState(false);

  const { playerMap: basePlayerMap, homeFouls, awayFouls } = useMemo(
    () => deriveStats(plays, session?.current_period ?? 1),
    [plays, session?.current_period]
  );
  const clockWhole = Math.floor(clockSecs);
  const playerMap = useMemo(
    () => withSecondsPlayed(
      basePlayerMap,
      computeSecondsPlayed(stints, session?.current_period ?? 1, clockWhole, session?.status === "live")
    ),
    [basePlayerMap, stints, session?.current_period, session?.status, clockWhole]
  );

  const running = session?.clock_running ?? false;

  async function handleCourtTap(player: PlayerWithUser) {
    if (pendingIn) {
      await substitutePlayer(pendingIn, player.user_id);
      setPendingIn(null);
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer((prev) => prev?.user_id === player.user_id ? null : player);
    }
  }

  async function handleBenchTap(player: PlayerWithUser) {
    if (onCourt.length < 5) {
      await setLineup([...onCourt.map((p) => p.user_id), player.user_id]);
    } else {
      setPendingIn((prev) => prev === player.user_id ? null : player.user_id);
    }
    setSelectedPlayer(null);
  }

  async function handleAction(event: PlayEventType) {
    if (!selectedPlayer) return;
    const ok = await recordPlay({ event_type: event, player_id: selectedPlayer.user_id });
    if (ok) setSelectedPlayer(null); // keep the player selected if the tap was not accepted
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "var(--bg)", color: "var(--text)",
      fontFamily: SANS, display: "flex", flexDirection: "column",
      userSelect: "none",
    } as React.CSSProperties}>

      {/* ── TOP STRIP (64px, always visible) ── */}
      <div style={{
        height: 64, flexShrink: 0,
        background: "var(--panel)", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 8, padding: "0 8px",
      }}>
        {/* Hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8, border: "1px solid var(--line)", background: "transparent",
            cursor: "pointer", color: "var(--text)", fontSize: 18, flexShrink: 0,
          } as React.CSSProperties}
        >
          ≡
        </button>

        {/* Score */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            {session?.home_score ?? 0}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 16, color: "var(--muted)", padding: "0 2px" }}>–</span>
          <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "var(--muted)" }}>
            {session?.away_score ?? 0}
          </span>
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4, whiteSpace: "nowrap" }}>
            Q{session?.current_period ?? 1}
          </span>
          {homeFouls >= 4 && (
            <span style={{
              fontSize: 9, fontWeight: 800, color: "var(--danger)",
              background: "var(--dangerSoft)", padding: "1px 5px",
              borderRadius: 4, marginLeft: 4,
            }}>
              TF {homeFouls}
            </span>
          )}
        </div>

        {/* Clock */}
        <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, flexShrink: 0, color: "var(--text)" }}>
          {formatClock(clockSecs)}
        </span>

        {/* Start / Stop */}
        <button
          onClick={running ? stopClock : startClock}
          style={{
            height: 56, minWidth: 96, borderRadius: 10, border: "none",
            ...clockButtonColors(running),
            cursor: "pointer", fontFamily: SANS, fontSize: 24, fontWeight: 800,
            flexShrink: 0, padding: "0 14px",
          } as React.CSSProperties}
        >
          {running ? "■" : "▶"}
        </button>

        {/* Fim de período / fim de jogo */}
        {onNextPeriod && onFinish && (
          <PeriodBar compact period={session?.current_period ?? 1}
            homeScore={session?.home_score ?? 0} awayScore={session?.away_score ?? 0}
            onNextPeriod={onNextPeriod} onFinish={onFinish} />
        )}

        {/* Opponent toggle */}
        <button
          onClick={() => setShowOpp((v) => !v)}
          style={{
            height: 44, padding: "0 10px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${showOpp ? "var(--accent)" : "var(--line)"}`,
            background: showOpp ? "var(--accentSoft)" : "transparent",
            color: showOpp ? "var(--accent)" : "var(--muted)",
            fontFamily: SANS, fontSize: 10, fontWeight: 800, flexShrink: 0,
          } as React.CSSProperties}
        >
          OPP
        </button>
      </div>

      {/* ── OPPONENT STRIP (collapsible) ── */}
      {showOpp && (
        <div style={{
          background: "var(--panel)", borderBottom: "1px solid var(--line)",
          padding: "6px 8px", display: "flex", alignItems: "center",
          gap: 6, flexWrap: "wrap", flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
            color: "var(--muted)", textTransform: "uppercase",
          }}>
            OPP PTS:
          </span>
          {([1, 2, 3] as const).map((pts) => (
            <button key={pts} onClick={() => recordOpponentPoints(pts)} style={{
              height: 40, minWidth: 44, borderRadius: 8, border: "1px solid var(--line)",
              background: "var(--chip)", color: "var(--text)", cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 800,
            } as React.CSSProperties}>
              +{pts}
            </button>
          ))}
          {([1, 2, 3] as const).map((pts) => (
            <button key={`miss${pts}`} onClick={() => recordOpponentMiss(pts)}
              title={`Opponent missed ${pts === 1 ? "free throw" : `${pts}PT`}`}
              style={{
                height: 40, minWidth: 44, borderRadius: 8, border: "1px solid var(--danger)",
                background: "var(--dangerSoft)", color: "var(--danger)", cursor: "pointer",
                fontFamily: SANS, fontSize: 13, fontWeight: 800,
              } as React.CSSProperties}>
              ✕{pts}
            </button>
          ))}
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
            color: "var(--muted)", textTransform: "uppercase", marginLeft: 6,
          }}>
            OPP F:
          </span>
          {(["foul_def", "foul_of", "foul_tec", "foul_anti"] as FoulType[]).map((t, i) => (
            <button key={t} onClick={() => recordOpponentFoul(t)} style={{
              height: 40, minWidth: 40, padding: "0 8px", borderRadius: 8,
              border: "1px solid var(--danger)", background: "var(--dangerSoft)",
              color: "var(--danger)", cursor: "pointer", fontFamily: SANS, fontSize: 10, fontWeight: 800,
            } as React.CSSProperties}>
              {["DEF", "OFF", "TECH", "UNSP"][i]}
            </button>
          ))}
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
            {awayFouls}/5
          </span>
        </div>
      )}

      {/* ── MAIN ROW ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* LEFT: Players (court + bench) */}
        <div style={{
          width: "40%", minWidth: 150, maxWidth: 240,
          borderRight: "1px solid var(--line)",
          overflowY: "auto", padding: 6,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {/* EM CAMPO label */}
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)",
            textTransform: "uppercase", padding: "0 4px 2px", flexShrink: 0,
          }}>
            ON COURT {onCourt.length}/5
            {pendingIn && (
              <span style={{ color: "var(--accent)" }}> · tap to substitute</span>
            )}
          </div>

          {onCourt.map((p) => {
            const st = playerMap.get(p.user_id);
            return (
              <PlayerRow
                key={p.user_id}
                player={p}
                pts={st?.pts ?? 0}
                fouls={st?.fouls_total ?? 0}
                secs={st?.secs_played ?? 0}
                isSelected={selectedPlayer?.user_id === p.user_id}
                isSubTarget={!!pendingIn}
                isPendingIn={false}
                onClick={() => handleCourtTap(p)}
              />
            );
          })}

          {bench.length > 0 && (
            <>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)",
                textTransform: "uppercase", padding: "4px 4px 2px", flexShrink: 0,
                borderTop: "1px solid var(--line)", marginTop: 4,
              }}>
                BENCH
              </div>
              {bench.map((p) => {
                const st = playerMap.get(p.user_id);
                return (
                  <PlayerRow
                    key={p.user_id}
                    player={p}
                    pts={st?.pts ?? 0}
                    fouls={st?.fouls_total ?? 0}
                    secs={st?.secs_played ?? 0}
                    isSelected={false}
                    isSubTarget={false}
                    isPendingIn={pendingIn === p.user_id}
                    onClick={() => handleBenchTap(p)}
                  />
                );
              })}
            </>
          )}
        </div>

        {/* RIGHT: Action panel */}
        <div style={{
          flex: 1, overflowY: "auto", padding: 8,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {/* Selected player label */}
          <div style={{
            fontSize: 11, fontWeight: 700, minHeight: 18, flexShrink: 0,
            color: selectedPlayer ? "var(--text)" : "var(--muted)",
          }}>
            {selectedPlayer
              ? `#${selectedPlayer.jersey_number} ${selectedPlayer.user.name}`
              : "← Select a player on court"
            }
          </div>

          {/* Scoring: 3 cols */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {SCORE_ACTIONS.map((a) => (
              <ActionButton
                key={a.event} event={a.event} label={a.label} sub={a.sub}
                actionStyle={a.style} enabled={!!selectedPlayer && !recording}
                onClick={() => handleAction(a.event)}
              />
            ))}
          </div>

          {/* Stats: 3 cols */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {STAT_ACTIONS.map((a) => (
              <ActionButton
                key={a.event} event={a.event} label={a.label}
                actionStyle={a.style} enabled={!!selectedPlayer && !recording}
                onClick={() => handleAction(a.event)}
              />
            ))}
          </div>

          {/* Fouls: 5 cols (inclui falta sofrida) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {FOUL_ACTIONS.map((a) => (
              <ActionButton
                key={a.event} event={a.event} label={a.label}
                actionStyle={a.style} enabled={!!selectedPlayer && !recording}
                onClick={() => handleAction(a.event)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM TABS ── */}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--line)" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", height: 36 }}>
          {(["banco", "feed"] as const).map((tab, idx) => (
            <button
              key={tab}
              onClick={() => setBottomTab(bottomTab === tab ? null : tab)}
              style={{
                flex: 1, height: 36, border: "none", cursor: "pointer",
                background: bottomTab === tab ? "var(--accentSoft)" : "var(--panel)",
                color: bottomTab === tab ? "var(--accent)" : "var(--muted)",
                fontFamily: SANS, fontSize: 9, fontWeight: 800,
                letterSpacing: "0.08em", textTransform: "uppercase",
                borderRight: idx === 0 ? "1px solid var(--line)" : "none",
              } as React.CSSProperties}
            >
              {tab === "banco" ? `BENCH (${bench.length})` : `FEED (${plays.length})`}
            </button>
          ))}
        </div>

        {/* Banco tab content */}
        {bottomTab === "banco" && (
          <div style={{
            padding: "6px 8px", display: "flex",
            flexWrap: "wrap", gap: 5, maxHeight: 88, overflowY: "auto",
          }}>
            {bench.map((p) => {
              const st = playerMap.get(p.user_id);
              return (
                <button key={p.user_id} onClick={() => handleBenchTap(p)} style={{
                  height: 44, padding: "0 12px", borderRadius: 999,
                  border: pendingIn === p.user_id
                    ? "2px solid var(--accent)"
                    : "1px solid var(--line)",
                  background: "var(--chip)", color: "var(--text)",
                  cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600,
                } as React.CSSProperties}>
                  #{p.jersey_number} {liveName(p.user.name)} {st?.pts ?? 0}P
                </button>
              );
            })}
          </div>
        )}

        {/* Feed tab content */}
        {bottomTab === "feed" && (
          <div style={{ maxHeight: 88, overflowY: "auto", padding: "4px 8px" }}>
            {plays.slice(0, 12).map((play) => {
              const plyr = roster.find((r) => r.user_id === play.player_id);
              const label = PLAY_LABELS[play.event_type] ?? play.event_type;
              return (
                <div key={play.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  minHeight: 28, fontSize: 11,
                  borderBottom: "1px solid var(--line)", padding: "3px 0",
                }}>
                  <span style={{ fontFamily: MONO, color: "var(--muted)", fontSize: 9, minWidth: 38 }}>
                    {play.game_clock ?? "—"}
                  </span>
                  <span style={{ flex: 1, color: "var(--text)" }}>
                    {!play.is_home_team && <span style={{ color: "var(--muted)" }}>OPP · </span>}
                    {plyr && `#${plyr.jersey_number} `}
                    {label}
                  </span>
                  <span style={{ fontFamily: MONO, color: "var(--muted)", fontSize: 9, minWidth: 45 }}>
                    {play.home_score_after}–{play.away_score_after}
                  </span>
                  {!UNUNDOABLE.has(play.event_type) && (
                    <button
                      onClick={() => undoPlay(String(play.id))}
                      disabled={recording}
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        border: "1px solid var(--danger)", background: "var(--dangerSoft)",
                        color: "var(--danger)", cursor: "pointer",
                        fontSize: 12, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      } as React.CSSProperties}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SLIDE-OUT DRAWER ── */}
      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }}
          />
          <div style={{
            position: "fixed", left: 0, top: 0, bottom: 0, width: 220,
            background: "var(--panel)", borderRight: "1px solid var(--line)",
            zIndex: 201, padding: 16, display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
              {session?.opponent_name
                ? `${clubName} vs ${session.opponent_name}`
                : "Live game"
              }
            </div>

            {onOpenTutorial && (
              <button onClick={() => { setDrawerOpen(false); onOpenTutorial(); }} style={{
                height: 48, borderRadius: 8, border: "1px solid var(--line)",
                background: "var(--chip)", color: "var(--text)", cursor: "pointer",
                fontFamily: SANS, fontSize: 13, fontWeight: 800,
              } as React.CSSProperties}>
                ❓ Tutorial
              </button>
            )}

            <button onClick={() => setDrawerOpen(false)} style={{
              height: 44, borderRadius: 8, border: "1px solid var(--line)",
              background: "transparent", color: "var(--text)", cursor: "pointer",
              fontFamily: SANS, fontSize: 13, fontWeight: 600,
              textAlign: "left", padding: "0 12px",
            } as React.CSSProperties}>
              ✕ Close
            </button>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                color: "var(--muted)", textTransform: "uppercase", marginBottom: 8,
              }}>
                OPP. REBOUNDS
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["reb_off", "reb_def"] as const).map((t) => (
                  <button key={t} onClick={() => { recordOpponentReb(t); setDrawerOpen(false); }} style={{
                    height: 44, flex: 1, borderRadius: 8, border: "1px solid var(--line)",
                    background: "var(--chip)", color: "var(--text)", cursor: "pointer",
                    fontFamily: SANS, fontSize: 11, fontWeight: 700,
                  } as React.CSSProperties}>
                    {t === "reb_off" ? "OFF REB" : "DEF REB"}
                  </button>
                ))}
              </div>
            </div>

            {callTimeout && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                  color: "var(--muted)", textTransform: "uppercase", marginBottom: 8,
                }}>
                  TIMEOUT
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["home", "away"] as const).map((team) => (
                    <button key={team} onClick={() => { void callTimeout(team); setDrawerOpen(false); }} style={{
                      height: 44, flex: 1, borderRadius: 8, border: "1px solid var(--line)",
                      background: "var(--chip)", color: "var(--text)", cursor: "pointer",
                      fontFamily: SANS, fontSize: 11, fontWeight: 700,
                    } as React.CSSProperties}>
                      {team === "home" ? "US" : "OPP"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                color: "var(--muted)", textTransform: "uppercase", marginBottom: 8,
              }}>
                TEAM FOULS
              </div>
              <div style={{ display: "flex", gap: 16, fontFamily: SANS }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clubName}</div>
                  <div style={{
                    fontFamily: MONO, fontSize: 24, fontWeight: 700,
                    color: homeFouls >= 4 ? "var(--danger)" : "var(--text)",
                  }}>
                    {homeFouls}<span style={{ fontSize: 12, color: "var(--muted)" }}>/5</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.opponent_name || "OPP"}</div>
                  <div style={{
                    fontFamily: MONO, fontSize: 24, fontWeight: 700,
                    color: awayFouls >= 4 ? "var(--danger)" : "var(--text)",
                  }}>
                    {awayFouls}<span style={{ fontSize: 12, color: "var(--muted)" }}>/5</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
