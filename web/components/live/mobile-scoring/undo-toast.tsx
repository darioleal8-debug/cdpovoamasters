"use client";

import { useEffect, useState } from "react";

export interface UndoItem {
  playId:    string | null;  // null se ainda não confirmado pelo servidor
  clientId:  string;
  label:     string;         // ex: "#7 Silva · 2pt ✓"
  expiresAt: number;         // Date.now() + 5000
}

interface Props {
  item:     UndoItem | null;
  onUndo:   (item: UndoItem) => void;
  onExpire: () => void;
}

export function UndoToast({ item, onUndo, onExpire }: Props) {
  const [pct, setPct] = useState(100);

  useEffect(() => {
    if (!item) { setPct(100); return; }
    const total = item.expiresAt - Date.now();
    if (total <= 0) { onExpire(); return; }

    const interval = setInterval(() => {
      const remaining = item.expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
        return;
      }
      setPct(Math.round((remaining / 5000) * 100));
    }, 100);

    return () => clearInterval(interval);
  }, [item, onExpire]);

  if (!item) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:       "fixed",
        bottom:         "env(safe-area-inset-bottom, 0px)",
        left:           0,
        right:          0,
        zIndex:         50,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "10px 16px",
        background:     "#1a2a45",
        borderTop:      "1px solid rgba(169,180,199,.12)",
        userSelect:     "none",
        gap:            12,
      }}
    >
      {/* Progress bar */}
      <div style={{
        position:   "absolute",
        top:        0,
        left:       0,
        height:     2,
        width:      `${pct}%`,
        background: "#F97316",
        transition: "width 0.1s linear",
      }} />

      <span style={{ fontSize: 13, fontWeight: 600, color: "#C2D3F0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>

      <button
        type="button"
        onClick={() => onUndo(item)}
        style={{
          height:       40,
          padding:      "0 16px",
          borderRadius: 8,
          border:       "1px solid rgba(249,115,22,.4)",
          background:   "rgba(249,115,22,.12)",
          color:        "#F97316",
          fontSize:     13,
          fontWeight:   700,
          cursor:       "pointer",
          touchAction:  "manipulation",
          flexShrink:   0,
        }}
      >
        Desfazer
      </button>
    </div>
  );
}
