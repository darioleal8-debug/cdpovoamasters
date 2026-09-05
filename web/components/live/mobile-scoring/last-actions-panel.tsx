"use client";

import type { PlayByPlay, PlayEventType, PlayerWithUser } from "@/types/database";

const EVENT_LABELS: Partial<Record<PlayEventType | string, string>> = {
  "2pt_made":       "2pt ✓",
  "2pt_miss":       "2pt ✗",
  "3pt_made":       "3pt ✓",
  "3pt_miss":       "3pt ✗",
  "ft_made":        "LL ✓",
  "ft_miss":        "LL ✗",
  "rebound_off":    "Res. Of.",
  "rebound_def":    "Res. Def.",
  "assist":         "Assist.",
  "steal":          "Roubo",
  "block":          "Desarme",
  "turnover":       "Turnover",
  "foul_committed": "Falta",
  "foul_drawn":     "F. Sofrida",
  "substitution_in":"Sub.",
  "timeout":        "Timeout",
  "game_start":     "Início",
  "period_end":     "Fim Período",
  "game_end":       "Fim Jogo",
};

const MADE_COLOR   = "rgba(34,197,94,.8)";
const MISS_COLOR   = "rgba(239,68,68,.7)";
const NEUT_COLOR   = "rgba(169,180,199,.6)";

function eventColor(type: PlayEventType): string {
  if (type.endsWith("_made")) return MADE_COLOR;
  if (type.endsWith("_miss")) return MISS_COLOR;
  return NEUT_COLOR;
}

interface Props {
  plays:    PlayByPlay[];
  roster:   PlayerWithUser[];
  onUndo:   (playId: string) => void;
  onClose:  () => void;
}

const UNUNDOABLE: PlayEventType[] = [
  "game_start", "period_end", "game_end", "substitution_in",
];

export function LastActionsPanel({ plays, roster, onUndo, onClose }: Props) {
  const jerseyMap = Object.fromEntries(roster.map((p) => [p.user_id, p.jersey_number]));
  const nameMap   = Object.fromEntries(roster.map((p) => [p.user_id, p.user.name.split(" ")[0]]));

  // Mostrar apenas eventos não eliminados e relevantes, mais recentes primeiro
  const visible = plays
    .filter((p) => !p.deleted_at && p.event_type !== "period_start")
    .slice(0, 25);

  return (
    <div
      role="dialog"
      aria-label="Últimas ações"
      style={{
        position:   "absolute",
        inset:      0,
        zIndex:     40,
        display:    "flex",
        flexDirection: "column",
        background: "rgba(5,10,20,.88)",
        backdropFilter: "blur(8px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "12px 16px",
        borderBottom:   "1px solid rgba(169,180,199,.1)",
        flexShrink:     0,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "#F0F4FF", margin: 0, letterSpacing: "0.04em" }}>
          ÚLTIMAS AÇÕES
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            height:       36,
            padding:      "0 14px",
            borderRadius: 8,
            border:       "1px solid rgba(169,180,199,.2)",
            background:   "transparent",
            color:        "rgba(169,180,199,.6)",
            fontSize:     12,
            cursor:       "pointer",
            touchAction:  "manipulation",
          }}
        >
          Fechar
        </button>
      </div>

      {/* Lista */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}>
        {visible.length === 0 && (
          <p style={{ fontSize: 13, color: "rgba(169,180,199,.3)", textAlign: "center", padding: 24 }}>
            Sem eventos registados
          </p>
        )}
        {visible.map((play) => {
          const label   = EVENT_LABELS[play.event_type] ?? play.event_type;
          const jersey  = play.player_id ? jerseyMap[play.player_id] : null;
          const name    = play.player_id ? nameMap[play.player_id] : null;
          const col     = eventColor(play.event_type);
          const canUndo = !UNUNDOABLE.includes(play.event_type as PlayEventType);

          return (
            <div
              key={play.id}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            10,
                padding:        "8px 8px",
                borderRadius:   10,
                marginBottom:   4,
                background:     "rgba(169,180,199,.04)",
                border:         "1px solid rgba(169,180,199,.06)",
              }}
            >
              {/* Jersey + nome */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {jersey != null && (
                  <span style={{
                    fontFamily:    "'Barlow Condensed', 'Barlow', sans-serif",
                    fontSize:      18,
                    fontWeight:    800,
                    color:         "rgba(169,180,199,.4)",
                    minWidth:      26,
                    textAlign:     "right",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    #{jersey}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  {name && (
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#C2D3F0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </p>
                  )}
                  <p style={{ fontSize: 13, fontWeight: 700, color: col, margin: 0 }}>
                    {label}
                  </p>
                </div>
              </div>

              {/* Clock + período */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 11, color: "rgba(169,180,199,.4)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {play.game_clock}
                </p>
                <p style={{ fontSize: 10, color: "rgba(169,180,199,.25)", margin: 0 }}>
                  P{play.period}
                </p>
              </div>

              {/* Botão desfazer */}
              {canUndo && (
                <button
                  type="button"
                  onClick={() => onUndo(play.id)}
                  style={{
                    height:       36,
                    padding:      "0 10px",
                    borderRadius: 8,
                    border:       "1px solid rgba(239,68,68,.25)",
                    background:   "rgba(239,68,68,.08)",
                    color:        "rgba(239,68,68,.7)",
                    fontSize:     11,
                    cursor:       "pointer",
                    touchAction:  "manipulation",
                    flexShrink:   0,
                  }}
                >
                  Anular
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
