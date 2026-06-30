"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

// ─── Utilitários de cor ───────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  const pad = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
  return `#${pad(r)}${pad(g)}${pad(b)}`;
}

/** Mistura a cor com branco (ratio 0–1, onde 1 = branco puro) */
export function lightenHex(hex: string, ratio = 0.9): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio);
}

/** Devolve '#ffffff' ou '#1f2937' consoante o contraste */
export function contrastColor(hex: string): string {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1f2937" : "#ffffff";
}

// ─── Tipos ────────────────────────────────────────────────

export interface ClubTheme {
  primary:     string;
  secondary:   string;
  accent:      string;
  background:  string; // versão clara da primary
  primaryFg:   string; // branco ou preto
  secondaryFg: string;
  accentFg:    string;
}

export interface ClubSettings {
  club_name:       string;
  logo_url:        string | null;
  primary_color:   string;
  secondary_color: string;
  accent_color:    string;
}

// ─── Defaults ─────────────────────────────────────────────

const DEFAULT_PRIMARY   = "#111111";
const DEFAULT_SECONDARY = "#F28C28";
const DEFAULT_ACCENT    = "#ffffff";

const DEFAULTS: ClubSettings = {
  club_name:       "CD Póvoa Masters",
  logo_url:        null,
  primary_color:   DEFAULT_PRIMARY,
  secondary_color: DEFAULT_SECONDARY,
  accent_color:    DEFAULT_ACCENT,
};

function deriveTheme(primary: string, secondary: string, accent: string): ClubTheme {
  return {
    primary,
    secondary,
    accent,
    background:  lightenHex(primary, 0.93),
    primaryFg:   contrastColor(primary),
    secondaryFg: contrastColor(secondary),
    accentFg:    contrastColor(accent),
  };
}

function applyThemeVars(theme: ClubTheme) {
  if (typeof document === "undefined") return;
  const r = document.documentElement.style;
  r.setProperty("--club-primary",      theme.primary);
  r.setProperty("--club-secondary",    theme.secondary);
  r.setProperty("--club-accent",       theme.accent);
  r.setProperty("--club-bg",           theme.background);
  r.setProperty("--club-primary-fg",   theme.primaryFg);
  r.setProperty("--club-secondary-fg", theme.secondaryFg);
  r.setProperty("--club-accent-fg",    theme.accentFg);
}

// ─── Context ──────────────────────────────────────────────

interface ClubContextValue {
  settings: ClubSettings;
  theme:    ClubTheme;
  loading:  boolean;
  refresh:  () => void;
}

const DEFAULT_THEME = deriveTheme(DEFAULT_PRIMARY, DEFAULT_SECONDARY, DEFAULT_ACCENT);

const ClubContext = createContext<ClubContextValue>({
  settings: DEFAULTS,
  theme:    DEFAULT_THEME,
  loading:  true,
  refresh:  () => {},
});

// ─── Provider ─────────────────────────────────────────────

export function ClubProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ClubSettings>(DEFAULTS);
  const [theme,    setTheme]    = useState<ClubTheme>(DEFAULT_THEME);
  const [loading,  setLoading]  = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Carregar configurações do clube + kits em paralelo
      const [settingsRes, kitsRes] = await Promise.all([
        fetch("/api/club-settings", { cache: "no-store" }),
        fetch("/api/team-kits",     { cache: "no-store" }),
      ]);

      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      const kitsData     = kitsRes.ok     ? await kitsRes.json()     : {};

      const clubName = settingsData.club_name ?? DEFAULTS.club_name;
      const logoUrl  = settingsData.logo_url  ?? null;

      // Derivar cores: kit do clube tem prioridade sobre club_settings
      const kits     = (kitsData.kits ?? []) as Array<{
        team_name: string;
        jersey_home_color: string;
        shorts_home_color: string;
        jersey_away_color: string;
      }>;
      const clubKit  = kits.find((k) => k.team_name.toLowerCase() === clubName.toLowerCase());

      const primary   = clubKit?.jersey_home_color ?? settingsData.primary_color   ?? DEFAULT_PRIMARY;
      const secondary = clubKit?.shorts_home_color ?? settingsData.secondary_color ?? DEFAULT_SECONDARY;
      const accent    = clubKit?.jersey_away_color ?? settingsData.accent_color    ?? DEFAULT_ACCENT;

      const newSettings: ClubSettings = { club_name: clubName, logo_url: logoUrl, primary_color: primary, secondary_color: secondary, accent_color: accent };
      const newTheme = deriveTheme(primary, secondary, accent);

      setSettings(newSettings);
      setTheme(newTheme);
      applyThemeVars(newTheme);
    } catch {
      // Falha silenciosa — mantém defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ClubContext.Provider value={{ settings, theme, loading, refresh }}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClubSettings() {
  return useContext(ClubContext);
}
