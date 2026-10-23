"use client";

import { useState } from "react";

interface TeamAvatarProps {
  name: string;
  logoUrl?: string | null;
  updatedAt?: string | null;
  sigla?: string | null;
  size?: number;
  radius?: number;
  initBg?: string;
  initColor?: string;
}

function getInitials(name: string, sigla?: string | null): string {
  if (sigla) return sigla.slice(0, 3).toUpperCase();
  const stripped = name.replace(/^(bc|cd|gd|sc|ccd|acb?|str?)\s+/i, "").trim();
  const words = stripped.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

export function TeamAvatar({
  name,
  logoUrl,
  updatedAt,
  sigla,
  size = 44,
  radius = 8,
  initBg = "#F0EAE1",
  initColor = "#6F675F",
}: TeamAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const showLogo = !!logoUrl && !imgFailed;
  const initials = getInitials(name, sigla);
  const fontSize = Math.round(size * (initials.length > 2 ? 0.28 : 0.34));

  // Cache-buster: quando o ficheiro é substituído o URL não muda, mas updated_at sim
  const src =
    logoUrl && updatedAt
      ? `${logoUrl}?v=${new Date(updatedAt).getTime()}`
      : logoUrl ?? undefined;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: showLogo ? "#fff" : initBg,
      }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Logótipo ${name}`}
          width={size}
          height={size}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          style={{
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 800,
            fontSize: fontSize,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: initColor,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
