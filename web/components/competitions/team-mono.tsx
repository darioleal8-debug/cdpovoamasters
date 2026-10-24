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
}

export function TeamMono({ name, size = 40, logoUrl }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const hue = teamHue(name);
  const initials = teamAbbr(name);
  const fs = Math.round(size * (initials.length > 2 ? 0.3 : 0.36));

  if (logoUrl && !imgFailed) {
    return (
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
