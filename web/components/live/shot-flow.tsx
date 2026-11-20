"use client";

import { useEffect, useState } from "react";
import type { PlayerWithUser, PlayEventType } from "@/types/database";
import { ShotCourt } from "@/components/live/shot-court";
import {
  FREE_THROW_POINT, SHOT_SPOT_MESSAGES, SHOT_ZONE_LABELS, classifyShotZone, isMadeShot, resolveShotSpot, shotKindOf,
} from "@/lib/live/shot-zones";

const SANS = "var(--font-sans, system-ui, sans-serif)";

const EVENT_TITLE: Record<string, string> = {
  "2pt_made": "2PT made", "2pt_miss": "2PT missed",
  "3pt_made": "3PT made", "3pt_miss": "3PT missed",
  "ft_made": "Free throw made", "ft_miss": "Free throw missed",
};

interface Props {
  shot: { event_type: PlayEventType; player_id: string; opponent?: boolean };
  /** Opponent team name, shown in the header when the shot is the opponent's. */
  opponentName?: string | null;
  roster: PlayerWithUser[];
  /** Players currently on court (assist candidates). */
  onCourt: PlayerWithUser[];
  saving: boolean;
  onConfirm: (spot: { x: number; y: number } | null, assistPlayerId: string | null, blocked?: boolean) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * One screen shown after the scorer taps a shot button:
 *  - tap the court where the shot was taken. A 3PT is only accepted behind the 3-point line and a 2PT
 *    only inside it (the wrong area is hatched; taps just past the line are snapped to the right side);
 *  - for made 2PT / 3PT, tapping the assisting player (or "No assist") saves the shot.
 * Free throws use the fixed line spot and just need a confirmation.
 */
export function ShotFlow({ shot, opponentName, roster, onCourt, saving, onConfirm, onCancel }: Props) {
  const kind = shotKindOf(shot.event_type);
  const made = isMadeShot(shot.event_type);
  const isOpp = shot.opponent === true;
  const needsAssist = made && kind !== "ft" && !isOpp;
  const shooter = roster.find((p) => p.user_id === shot.player_id);

  const canBeBlocked = !made && kind !== "ft" && !isOpp;
  const [blocked, setBlocked] = useState(false);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(kind === "ft" ? FREE_THROW_POINT : null);
  const [error, setError] = useState<string | null>(null);
  const [snappedNote, setSnappedNote] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  function pick(x: number, y: number) {
    if (!kind) return;
    const r = resolveShotSpot(kind, x, y);
    if (!r.ok) {
      setError(SHOT_SPOT_MESSAGES[r.reason]);
      setSnappedNote(false);
      try { navigator.vibrate?.(60); } catch { /* not supported */ }
      return; // keep the previous valid spot, never accept the wrong side of the line
    }
    setError(null);
    setSnappedNote(r.snapped);
    setSpot({ x: r.x, y: r.y });
  }

  const zone = spot ? classifyShotZone(spot.x, spot.y) : null;
  const canSave = !!spot && !saving;

  const teammates = onCourt
    .filter((p) => p.user_id !== shot.player_id)
    .sort((a, b) => (a.jersey_number ?? 99) - (b.jersey_number ?? 99));

  const btn: React.CSSProperties = {
    minHeight: 52, padding: "0 16px", borderRadius: 12, cursor: "pointer",
    fontFamily: SANS, fontSize: 15, fontWeight: 800, border: "1px solid var(--line)",
    background: "var(--chip, var(--panel))", color: "var(--text)",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shot location"
      style={{
        position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", padding: 12, fontFamily: SANS,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
    >
      <div
        style={{
          width: "min(920px, 100%)", maxHeight: "100%", overflowY: "auto",
          background: "var(--panel)", color: "var(--text)", border: "1px solid var(--line)",
          borderRadius: 18, padding: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start",
        }}
      >
        {/* Header */}
        <div style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--muted)", textTransform: "uppercase" }}>
            Shot location
          </span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>
            {isOpp ? `Opponent${opponentName ? ` · ${opponentName}` : ""}` : shooter ? `#${shooter.jersey_number ?? "–"} ${shooter.user.name}` : "Player"} · {EVENT_TITLE[shot.event_type] ?? shot.event_type}
          </span>
        </div>

        <div style={{ flex: "1 1 280px", width: "min(100%, 62vh)", minWidth: 240, maxWidth: 520 }}>
          <ShotCourt
            selected={spot}
            onPick={kind === "ft" ? undefined : pick}
            restrict={kind === "2" || kind === "3" ? kind : undefined}
            label="Tap the court where the shot was taken"
            style={{ color: "var(--muted)" }}
          />
        </div>

        <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
            {kind === "ft"
              ? "Free throw from the line."
              : kind === "3"
                ? "Tap behind the 3-point line. The hatched area is not allowed."
                : "Tap inside the 3-point line. The hatched area is not allowed."}
          </p>
          <div style={{ minHeight: 44, fontSize: 15, fontWeight: 700 }}>
            {zone ? SHOT_ZONE_LABELS[zone] : "No spot selected"}
            {snappedNote && !error && (
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                Moved to the {kind === "3" ? "outside" : "inside"} of the line.
              </div>
            )}
            {error && (
              <div role="alert" style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "var(--danger, #dc2626)" }}>
                {error}
              </div>
            )}
          </div>

          {canBeBlocked && (
            <button
              disabled={saving}
              onClick={() => setBlocked((b) => !b)}
              aria-pressed={blocked}
              style={{
                ...btn,
                background: blocked ? "var(--danger, #dc2626)" : "var(--chip, var(--panel))",
                color: blocked ? "#fff" : "var(--text)",
                borderColor: blocked ? "var(--danger, #dc2626)" : "var(--line)",
              }}
            >
              {blocked ? "✓ Shot blocked (block received)" : "Shot blocked by opponent?"}
            </button>
          )}

          {needsAssist ? (
            <>
              <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 800 }}>Who assisted? (tap to save)</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                {teammates.map((p) => (
                  <button
                    key={p.user_id}
                    disabled={!canSave}
                    onClick={() => onConfirm(spot, p.user_id)}
                    style={{
                      ...btn, minHeight: 58, textAlign: "left", display: "flex", flexDirection: "column",
                      justifyContent: "center", gap: 2, opacity: canSave ? 1 : 0.5,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>#{p.jersey_number ?? "–"}</span>
                    <span>{p.user.name.split(" ").slice(0, 2).join(" ")}</span>
                  </button>
                ))}
              </div>
              <button
                disabled={!canSave}
                onClick={() => onConfirm(spot, null)}
                style={{ ...btn, background: "var(--accent)", color: "var(--accentInk, #fff)", border: "none", opacity: canSave ? 1 : 0.5 }}
              >
                No assist
              </button>
            </>
          ) : (
            <button
              disabled={!canSave}
              onClick={() => onConfirm(spot, null, canBeBlocked ? blocked : undefined)}
              style={{ ...btn, background: "var(--accent)", color: "var(--accentInk, #fff)", border: "none", opacity: canSave ? 1 : 0.5 }}
            >
              Confirm
            </button>
          )}

          <button disabled={saving} onClick={onCancel} style={{ ...btn, fontWeight: 700, color: "var(--muted)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
