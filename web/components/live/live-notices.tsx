"use client";

import { useEffect, useState } from "react";
import { subscribeLiveNotice, type LiveNoticeItem } from "@/lib/live/notice";

const SANS = "var(--font-sans, system-ui, sans-serif)";
const COLORS = {
  ok: { bg: "oklch(0.33 0.1 145)", fg: "oklch(0.95 0.08 145)" },
  info: { bg: "oklch(0.3 0.03 250)", fg: "white" },
  error: { bg: "oklch(0.45 0.18 25)", fg: "white" },
} as const;

/** Soft confirmations (auto-hide, never block taps) so the scorer sees every action was registered. */
export function LiveNotices() {
  const [items, setItems] = useState<LiveNoticeItem[]>([]);

  useEffect(() => subscribeLiveNotice((n) => {
    setItems((cur) => [...cur.slice(-2), n]);
    window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== n.id)), n.kind === "error" ? 3500 : 1800);
  }), []);

  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", top: 84, left: 0, right: 0, zIndex: 400, pointerEvents: "none",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}
    >
      {items.map((n) => (
        <div
          key={n.id}
          style={{
            padding: "10px 18px", borderRadius: 999, fontFamily: SANS, fontSize: 14, fontWeight: 700,
            background: COLORS[n.kind].bg, color: COLORS[n.kind].fg,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)", maxWidth: "90vw",
          }}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}
