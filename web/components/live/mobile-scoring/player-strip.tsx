"use client";

import type { PlayerWithUser } from "@/types/database";

interface Props {
  roster:         PlayerWithUser[];
  onCourtIds:     string[];
  selectedId:     string | null;
  onSelect:       (id: string) => void;
}

const STRIP: React.CSSProperties = {
  width:          150,
  flexShrink:     0,
  overflowY:      "auto",
  overflowX:      "hidden",
  background:     "#0D1729",
  borderRight:    "1px solid rgba(255,255,255,.06)",
  display:        "flex",
  flexDirection:  "column",
  gap:            2,
  padding:        "6px 4px",
  userSelect:     "none",
};

function PlayerBtn({
  player,
  isOnCourt,
  isSelected,
  onSelect,
}: {
  player:     PlayerWithUser;
  isOnCourt:  boolean;
  isSelected: boolean;
  onSelect:   () => void;
}) {
  const name    = player.user.name;
  const first   = name.split(" ")[0];
  const last    = name.split(" ").slice(1).join(" ");
  const jersey  = player.jersey_number;

  const bg = isSelected
    ? "rgba(249,115,22,.22)"
    : isOnCourt
    ? "rgba(255,255,255,.06)"
    : "rgba(255,255,255,.02)";

  const border = isSelected
    ? "1px solid rgba(249,115,22,.5)"
    : isOnCourt
    ? "1px solid rgba(255,255,255,.1)"
    : "1px solid transparent";

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            8,
        padding:        "8px 8px",
        borderRadius:   10,
        background:     bg,
        border,
        cursor:         "pointer",
        touchAction:    "manipulation",
        minHeight:      52,
        textAlign:      "left",
        transition:     "background 0.1s",
        width:          "100%",
      }}
      aria-pressed={isSelected}
      aria-label={`${name} (#${jersey ?? "—"})`}
    >
      {/* Número */}
      <span style={{
        fontFamily:  "'Barlow Condensed', 'Barlow', sans-serif",
        fontSize:    18,
        fontWeight:  800,
        color:       isSelected ? "#F97316" : isOnCourt ? "#C2D3F0" : "rgba(169,180,199,.4)",
        minWidth:    28,
        textAlign:   "right",
        lineHeight:  1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {jersey ?? "—"}
      </span>

      {/* Nome */}
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{
          fontSize:     12,
          fontWeight:   700,
          color:        isSelected ? "#F97316" : isOnCourt ? "#C2D3F0" : "rgba(169,180,199,.4)",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          lineHeight:   1.1,
        }}>
          {first}
        </span>
        {last && (
          <span style={{
            fontSize:     10,
            color:        isSelected ? "rgba(249,115,22,.8)" : "rgba(169,180,199,.35)",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
            lineHeight:   1.1,
          }}>
            {last}
          </span>
        )}
      </span>

      {/* Indicador em campo */}
      {isOnCourt && (
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   isSelected ? "#F97316" : "rgba(169,180,199,.35)",
          flexShrink:   0,
          marginLeft:   "auto",
        }} />
      )}
    </button>
  );
}

export function PlayerStrip({ roster, onCourtIds, selectedId, onSelect }: Props) {
  // On-court first, then bench
  const onCourt = roster.filter((p) => onCourtIds.includes(p.user_id));
  const bench   = roster.filter((p) => !onCourtIds.includes(p.user_id));

  return (
    <div style={STRIP} role="listbox" aria-label="Selecionar jogador">
      {onCourt.length > 0 && (
        <>
          <span style={{
            fontSize:       9,
            fontWeight:     800,
            letterSpacing:  "0.1em",
            color:          "rgba(169,180,199,.3)",
            textTransform:  "uppercase",
            padding:        "2px 8px",
          }}>
            Em Campo
          </span>
          {onCourt.map((p) => (
            <PlayerBtn
              key={p.user_id}
              player={p}
              isOnCourt
              isSelected={selectedId === p.user_id}
              onSelect={() => onSelect(p.user_id)}
            />
          ))}
        </>
      )}

      {bench.length > 0 && (
        <>
          <span style={{
            fontSize:       9,
            fontWeight:     800,
            letterSpacing:  "0.1em",
            color:          "rgba(169,180,199,.2)",
            textTransform:  "uppercase",
            padding:        "6px 8px 2px",
          }}>
            Banco
          </span>
          {bench.map((p) => (
            <PlayerBtn
              key={p.user_id}
              player={p}
              isOnCourt={false}
              isSelected={selectedId === p.user_id}
              onSelect={() => onSelect(p.user_id)}
            />
          ))}
        </>
      )}

      {roster.length === 0 && (
        <p style={{ fontSize: 11, color: "rgba(169,180,199,.3)", padding: "16px 8px", textAlign: "center" }}>
          Sem convocados
        </p>
      )}
    </div>
  );
}
