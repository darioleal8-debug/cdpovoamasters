"use client";

import { useMemo, useState } from "react";
import type { PlayByPlay, PlayerWithUser } from "@/types/database";
import { EVENT_LABELS } from "./layout-1a";

const SANS = "var(--font-sans, system-ui, sans-serif)";
const MONO = "var(--font-mono, ui-monospace, monospace)";
const UNUNDOABLE = new Set(["game_start", "period_end", "game_end", "substitution_in"]);

interface Props {
  plays: PlayByPlay[];
  roster: PlayerWithUser[];
  recording: boolean;
  onUndoPlay: (id: string) => Promise<boolean>;
  onClose: () => void;
}

const periodLabel = (n: number) => (n <= 4 ? `Q${n}` : `OT${n - 4}`);

/** Full list of every logged play, filterable by period / team / player, with undo on each row. */
export function PlayHistory({ plays, roster, recording, onUndoPlay, onClose }: Props) {
  const [period, setPeriod] = useState<number | "all">("all");
  const [team, setTeam] = useState<"all" | "home" | "away">("all");
  const [playerId, setPlayerId] = useState<string>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const live = useMemo(() => plays.filter((p) => !p.deleted_at), [plays]);
  const periods = useMemo(
    () => Array.from(new Set(live.map((p) => p.period))).sort((a, b) => a - b),
    [live],
  );

  const filtered = live.filter(
    (p) =>
      (period === "all" || p.period === period) &&
      (team === "all" || (team === "home" ? p.is_home_team : !p.is_home_team)) &&
      (playerId === "all" || p.player_id === playerId),
  );

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: SANS, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent, #f97316)" : "var(--line)"}`,
    background: active ? "var(--accent, #f97316)" : "transparent",
    color: active ? "#fff" : "var(--text)",
  });

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column",
          background: "var(--panel, var(--bg))", color: "var(--text)", border: "1px solid var(--line)",
          borderRadius: 16, fontFamily: SANS, overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Play history</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{filtered.length} of {live.length} plays · tap UNDO to remove any play</div>
          </div>
          <button onClick={onClose} style={{ ...chip(false), padding: "8px 14px" }}>Close</button>
        </div>

        <div style={{ padding: "10px 18px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button style={chip(period === "all")} onClick={() => setPeriod("all")}>All periods</button>
            {periods.map((n) => (
              <button key={n} style={chip(period === n)} onClick={() => setPeriod(n)}>{periodLabel(n)}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <button style={chip(team === "all")} onClick={() => setTeam("all")}>Both teams</button>
            <button style={chip(team === "home")} onClick={() => setTeam("home")}>Our team</button>
            <button style={chip(team === "away")} onClick={() => setTeam("away")}>Opponent</button>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              style={{ ...chip(false), background: "var(--bg)", marginLeft: "auto" }}
            >
              <option value="all">All players</option>
              {roster.map((r) => (
                <option key={r.user_id} value={r.user_id}>#{r.jersey_number} {r.user.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 18px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No plays for this filter</div>
          )}
          {filtered.map((p) => {
            const player = roster.find((r) => r.user_id === p.player_id);
            const assist = p.secondary_player_id ? roster.find((r) => r.user_id === p.secondary_player_id) : null;
            const undoable = !UNUNDOABLE.has(p.event_type);
            const asking = confirmId === String(p.id);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", minWidth: 28 }}>{periodLabel(p.period)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--muted)", minWidth: 46 }}>{p.game_clock || "—"}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                  {!p.is_home_team && <span style={{ color: "var(--muted)" }}>Opponent · </span>}
                  {player && <span>#{player.jersey_number} {player.user.name.split(" ")[0]} · </span>}
                  {EVENT_LABELS[p.event_type] ?? p.event_type}
                  {assist && <span style={{ color: "var(--muted)", fontWeight: 600 }}> (ast #{assist.jersey_number} {assist.user.name.split(" ")[0]})</span>}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", minWidth: 52, textAlign: "right" }}>
                  {p.home_score_after}–{p.away_score_after}
                </span>
                {undoable ? (
                  asking ? (
                    <span style={{ display: "flex", gap: 4 }}>
                      <button
                        disabled={recording}
                        onClick={async () => { await onUndoPlay(String(p.id)); setConfirmId(null); }}
                        style={{ ...chip(true), background: "var(--danger, #ef4444)", borderColor: "var(--danger, #ef4444)" }}
                      >Confirm</button>
                      <button onClick={() => setConfirmId(null)} style={chip(false)}>No</button>
                    </span>
                  ) : (
                    <button
                      disabled={recording}
                      onClick={() => setConfirmId(String(p.id))}
                      style={{ ...chip(false), color: "var(--danger, #ef4444)", borderColor: "var(--danger, #ef4444)" }}
                    >Undo</button>
                  )
                ) : (
                  <span style={{ width: 62, fontSize: 10, color: "var(--muted)", textAlign: "center" }}>locked</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
