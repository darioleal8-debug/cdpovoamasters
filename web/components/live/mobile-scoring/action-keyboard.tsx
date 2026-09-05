"use client";

import type { PlayEventType } from "@/types/database";

interface ActionDef {
  type:    PlayEventType;
  label:   string;
  pts?:    number;
  color?:  string;
  dimmed?: boolean;
}

const GROUPS: Array<{ label: string; actions: ActionDef[] }> = [
  {
    label: "Pontuação",
    actions: [
      { type: "2pt_made", label: "2pt ✓", pts: 2, color: "#22c55e" },
      { type: "2pt_miss", label: "2pt ✗",         color: "rgba(239,68,68,.7)" },
      { type: "3pt_made", label: "3pt ✓", pts: 3, color: "#22c55e" },
      { type: "3pt_miss", label: "3pt ✗",         color: "rgba(239,68,68,.7)" },
      { type: "ft_made",  label: "LL ✓",  pts: 1, color: "#22c55e" },
      { type: "ft_miss",  label: "LL ✗",          color: "rgba(239,68,68,.7)" },
    ],
  },
  {
    label: "Ressalto",
    actions: [
      { type: "rebound_off", label: "Res. Of." },
      { type: "rebound_def", label: "Res. Def." },
    ],
  },
  {
    label: "Técnica",
    actions: [
      { type: "assist",         label: "Assist." },
      { type: "steal",          label: "Roubo" },
      { type: "block",          label: "Desarme" },
      { type: "turnover",       label: "Turnover" },
      { type: "foul_committed", label: "Falta" },
    ],
  },
];

const SHOT_TYPES: PlayEventType[] = [
  "2pt_made", "2pt_miss", "3pt_made", "3pt_miss",
];

interface Props {
  selectedPlayerId: string | null;
  onAction:         (type: PlayEventType, pts: number, needsLocation: boolean) => void;
}

export function ActionKeyboard({ selectedPlayerId, onAction }: Props) {
  const disabled = !selectedPlayerId;

  return (
    <div style={{
      width:          224,
      flexShrink:     0,
      overflowY:      "auto",
      background:     "#0A1220",
      borderLeft:     "1px solid rgba(255,255,255,.06)",
      display:        "flex",
      flexDirection:  "column",
      gap:            6,
      padding:        "6px 6px",
      userSelect:     "none",
    }}>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <span style={{
            display:       "block",
            fontSize:      9,
            fontWeight:    800,
            letterSpacing: "0.1em",
            color:         "rgba(169,180,199,.3)",
            textTransform: "uppercase",
            padding:       "2px 4px 4px",
          }}>
            {group.label}
          </span>
          <div style={{
            display:             "grid",
            gridTemplateColumns: group.actions.length >= 4
              ? "1fr 1fr"
              : `repeat(${Math.min(group.actions.length, 3)}, 1fr)`,
            gap: 4,
          }}>
            {group.actions.map((action) => {
              const needsLoc = SHOT_TYPES.includes(action.type);
              const col = action.color ?? "rgba(169,180,199,.7)";
              return (
                <button
                  key={action.type}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAction(action.type, action.pts ?? 0, needsLoc)}
                  style={{
                    minHeight:     52,
                    borderRadius:  10,
                    border:        `1px solid ${disabled ? "rgba(255,255,255,.06)" : `${col}33`}`,
                    background:    disabled ? "rgba(255,255,255,.03)" : `${col}11`,
                    color:         disabled ? "rgba(169,180,199,.2)" : col,
                    fontSize:      13,
                    fontWeight:    700,
                    cursor:        disabled ? "default" : "pointer",
                    touchAction:   "manipulation",
                    transition:    "background 0.1s, border-color 0.1s",
                    fontFamily:    "'Barlow', sans-serif",
                    lineHeight:    1.2,
                    padding:       "4px 2px",
                    textAlign:     "center",
                    display:       "flex",
                    alignItems:    "center",
                    justifyContent: "center",
                  }}
                  aria-label={action.label}
                  aria-disabled={disabled}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {disabled && (
        <p style={{
          fontSize:    11,
          color:       "rgba(169,180,199,.25)",
          textAlign:   "center",
          padding:     "12px 8px",
          marginTop:   "auto",
          lineHeight:  1.5,
        }}>
          Seleciona um jogador
        </p>
      )}
    </div>
  );
}
