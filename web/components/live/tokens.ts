import type { CSSProperties } from "react";

export const LIGHT_TOKENS: CSSProperties = {
  "--bg": "oklch(0.965 0.006 250)",
  "--panel": "oklch(1 0 0)",
  "--line": "oklch(0.88 0.008 250)",
  "--text": "oklch(0.24 0.02 250)",
  "--muted": "oklch(0.5 0.015 250)",
  "--chip": "oklch(0.95 0.006 250)",
  "--accent": "oklch(0.5 0.14 150)",
  "--accentSoft": "oklch(0.95 0.045 150)",
  "--accentInk": "oklch(1 0 0)",
  "--danger": "oklch(0.53 0.19 25)",
  "--dangerSoft": "oklch(0.955 0.04 25)",
  "--dim": "oklch(0.86 0.008 250)",
} as CSSProperties;

export const DARK_TOKENS: CSSProperties = {
  "--bg": "oklch(0.17 0.012 250)",
  "--panel": "oklch(0.22 0.014 250)",
  "--line": "oklch(0.33 0.014 250)",
  "--text": "oklch(0.97 0.005 250)",
  "--muted": "oklch(0.73 0.01 250)",
  "--chip": "oklch(0.27 0.014 250)",
  "--accent": "oklch(0.8 0.17 150)",
  "--accentSoft": "oklch(0.33 0.075 150)",
  "--accentInk": "oklch(0.16 0.02 150)",
  "--danger": "oklch(0.72 0.16 25)",
  "--dangerSoft": "oklch(0.32 0.08 25)",
  "--dim": "oklch(0.3 0.014 250)",
} as CSSProperties;

export const MONO = "'IBM Plex Mono', 'Courier New', monospace";
export const SANS = "'Archivo', system-ui, sans-serif";
