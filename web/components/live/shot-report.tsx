"use client";

import { useMemo, useState } from "react";
import { ShotChart, ZoneHeatmap } from "@/components/live/shot-court";
import { shotsFromPlays, zoneStats, type ShotPoint } from "@/lib/live/shot-zones";

export interface ShotRow {
  event_type: string;
  shot_x: number | null;
  shot_y: number | null;
  shot_zone: string | null;
  is_home_team?: boolean;
  player_id?: string | null;
  deleted_at?: string | null;
}

interface PlayerOption { id: string; name: string; number?: number | null }

function pct(made: number, att: number) {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : "—";
}

/**
 * Shot chart + zone map. Used in the game report (team or per player) and on the
 * player profile (all official games). Free throws are excluded: they always come from the line.
 */
export function ShotReport({
  plays, players, fixedPlayerId, emptyText,
}: {
  plays: ShotRow[];
  /** When given, shows a player filter ("All players" + each player). */
  players?: PlayerOption[];
  /** Locks the report to a single player (profile page). */
  fixedPlayerId?: string;
  emptyText?: string;
}) {
  const [playerId, setPlayerId] = useState<string>("all");
  const [view, setView] = useState<"chart" | "zones">("zones");

  const activePlayer = fixedPlayerId ?? (playerId === "all" ? undefined : playerId);

  const shots: ShotPoint[] = useMemo(
    () => shotsFromPlays(plays, { playerId: activePlayer }),
    [plays, activePlayer]
  );
  const zones = useMemo(() => zoneStats(shots), [shots]);

  const made = shots.filter((s) => s.made).length;
  const m2 = shots.filter((s) => s.kind === "2" && s.made).length;
  const a2 = shots.filter((s) => s.kind === "2").length;
  const m3 = shots.filter((s) => s.kind === "3" && s.made).length;
  const a3 = shots.filter((s) => s.kind === "3").length;

  const tab = (on: boolean): React.CSSProperties => ({
    height: 34, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
    border: "1px solid var(--border, #d4d4d8)",
    background: on ? "var(--club-primary, #111)" : "transparent",
    color: on ? "var(--club-primary-fg, #fff)" : "inherit",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={tab(view === "zones")} onClick={() => setView("zones")}>Zones</button>
        <button style={tab(view === "chart")} onClick={() => setView("chart")}>Shot chart</button>
        {players && !fixedPlayerId && (
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            aria-label="Player"
            style={{ height: 34, borderRadius: 8, padding: "0 10px", fontSize: 13, border: "1px solid var(--border, #d4d4d8)", background: "transparent", marginLeft: "auto" }}
          >
            <option value="all">All players</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.number != null ? `#${p.number} ` : ""}{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {shots.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
          {emptyText ?? "No shot locations recorded yet."}
        </p>
      ) : (
        <>
          <div style={{ maxWidth: 520, width: "100%" }}>
            {view === "zones" ? <ZoneHeatmap stats={zones} /> : <ShotChart shots={shots} />}
            {view === "chart" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                <span style={{ fontSize: 15 }}>
                  FG%: <strong style={{ fontSize: 24 }}>{shots.length ? ((made / shots.length) * 100).toFixed(1) : "0.0"}%</strong>{" "}
                  <span style={{ opacity: 0.7 }}>({made}-{shots.length})</span>
                </span>
                <span style={{ display: "flex", gap: 14, fontSize: 13, alignItems: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#2e7d32" strokeWidth="2.2" /></svg>
                    Made Shot
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3L13 13M13 3L3 13" stroke="#b3261e" strokeWidth="2.2" strokeLinecap="round" /></svg>
                    Missed Shot
                  </span>
                </span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong>FG</strong> {made}/{shots.length} ({pct(made, shots.length)})</span>
            <span><strong>2PT</strong> {m2}/{a2} ({pct(m2, a2)})</span>
            <span><strong>3PT</strong> {m3}/{a3} ({pct(m3, a3)})</span>
            {view === "chart" ? null : (
              <span style={{ opacity: 0.7 }}>
                Red → green = lower → higher FG% (made/attempted shown per zone)
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
