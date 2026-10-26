"use client";

import { useState } from "react";

/** Monograma circular de equipa — usa oklch(0.5 0.13 hue) derivado do nome */

function teamHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fff;
  return h % 360;
}

export function teamAbbr(name: string): string {
  const stripped = name.replace(/^(bc|cd|gd|sc|ccd|acb?|str?)\s+/i, "").trim();
  const words = stripped.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

interface Props {
  name: string;
  size?: number;
  logoUrl?: string | null;
  /** Quando true, mostra sempre a sigla abreviada mesmo quando há logótipo */
  showLabel?: boolean;
}

export function TeamMono({ name, size = 40, logoUrl, showLabel = false }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const hue = teamHue(name);
  const initials = teamAbbr(name);
  const fs = Math.round(size * (initials.length > 2 ? 0.3 : 0.36));

  if (logoUrl && !imgFailed) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        style={{ borderRadius: "50%", objectFit: "contain", flexShrink: 0, background: "#fff" }}
        onError={() => setImgFailed(true)}
      />
    );
    if (!showLabel) return img;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", flexShrink: 0 }}>
        {img}
        <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "8px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8C837A", lineHeight: 1 }}>
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `oklch(0.5 0.13 ${hue})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "#fff",
          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
          fontWeight: 700,
          fontSize: fs,
          lineHeight: 1,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        {initials}
      </span>
    </div>
  );
}
