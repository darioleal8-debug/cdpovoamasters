"use client";

import { useEffect, useState } from "react";
import type { PlayerWithUser, PlayEventType } from "@/types/database";
import { ShotCourt } from "@/components/live/shot-court";
import {
  FREE_THROW_POINT, SHOT_ZONE_LABELS, classifyShotZone, isMadeShot, isThreePointArea, shotKindOf,
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
 * Two quick steps shown after the scorer taps a shot button:
 *  1. where on the court the shot was taken (2PT / 3PT / free throw, made or missed);
 *  2. for made 2PT / 3PT, who assisted (or "No assist").
 */
export function ShotFlow({ shot, opponentName, roster, onCourt, saving, onConfirm, onCancel }: Props) {
  const kind = shotKindOf(shot.event_type);
  const made = isMadeShot(shot.event_type);
  const isOpp = shot.opponent === true;
  const needsAssist = made && kind !== "ft" && !isOpp;
  const shooter = roster.find((p) => p.user_id === shot.player_id);

  const canBeBlocked = !made && kind !== "ft" && !isOpp;
  const [blocked, setBlocked] = useState(false);
  const [step, setStep] = useState<"zone" | "assist">("zone");
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(kind === "ft" ? FREE_THROW_POINT : null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const zone = spot ? classifyShotZone(spot.x, spot.y) : null;
  const mismatch =
    spot && kind && kind !== "ft"
      ? (kind === "3") !== isThreePointArea(spot.x, spot.y)
      : false;

  async function finishZone(withSpot: { x: number; y: number } | null) {
    if (needsAssist) {
      setSpot(withSpot);
      setStep("assist");
      return;
    }
    await onConfirm(withSpot, null, canBeBlocked ? blocked : undefined);
  }

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
      aria-label={step === "zone" ? "Shot location" : "Assist"}
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
            {step === "zone" ? "Shot location" : "Assist"}
          </span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>
            {isOpp ? `Opponent${opponentName ? ` · ${opponentName}` : ""}` : shooter ? `#${shooter.jersey_number ?? "–"} ${shooter.user.name}` : "Player"} · {EVENT_TITLE[shot.event_type] ?? shot.event_type}
          </span>
        </div>

        {step === "zone" ? (
          <>
            <div style={{ flex: "1 1 280px", width: "min(100%, 62vh)", minWidth: 240, maxWidth: 520 }}>
              <ShotCourt
                selected={spot}
                onPick={(x, y) => setSpot({ x, y })}
                label="Tap the court where the shot was taken"
                style={{ color: "var(--muted)" }}
              />
            </div>
            <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                {kind === "ft"
                  ? "Free throw from the line."
                  : "Tap the court where the shot was taken."}
              </p>
              <div style={{ minHeight: 44, fontSize: 15, fontWeight: 700 }}>
                {zone ? SHOT_ZONE_LABELS[zone] : "No spot selected"}
                {mismatch && (
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "var(--danger, #dc2626)" }}>
                    {kind === "3"
                      ? "This spot is inside the 3-point line."
                      : "This spot is behind the 3-point line."}
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
              <button
                disabled={saving || !spot}
                onClick={() => finishZone(spot)}
                style={{ ...btn, background: "var(--accent)", color: "var(--accentInk, #fff)", border: "none", opacity: !spot ? 0.5 : 1 }}
              >
                {needsAssist ? "Confirm spot → assist" : "Confirm"}
              </button>
              {kind !== "ft" && !isOpp && (
                <button disabled={saving} onClick={() => finishZone(null)} style={{ ...btn, fontWeight: 700 }}>
                  Skip zone
                </button>
              )}
              <button disabled={saving} onClick={onCancel} style={{ ...btn, fontWeight: 700, color: "var(--muted)" }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: "1 1 100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Who assisted?</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {teammates.map((p) => (
                <button
                  key={p.user_id}
                  disabled={saving}
                  onClick={() => onConfirm(spot, p.user_id)}
                  style={{ ...btn, minHeight: 64, textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}
                >
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>#{p.jersey_number ?? "–"}</span>
                  <span>{p.user.name.split(" ").slice(0, 2).join(" ")}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                disabled={saving}
                onClick={() => onConfirm(spot, null)}
                style={{ ...btn, background: "var(--accent)", color: "var(--accentInk, #fff)", border: "none", flex: "1 1 200px" }}
              >
                No assist
              </button>
              <button disabled={saving} onClick={() => setStep("zone")} style={{ ...btn, fontWeight: 700 }}>
                ← Back
              </button>
              <button disabled={saving} onClick={onCancel} style={{ ...btn, fontWeight: 700, color: "var(--muted)" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
