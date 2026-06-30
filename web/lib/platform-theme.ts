// Tema fixo da plataforma HoopHub — usado nas páginas públicas
// (landing page e login). Completamente independente das
// configurações de branding dos clubes.

export const PLATFORM_LOGO = "/assets/logo/hoophub.png" as const;

export const PLATFORM_THEME = {
  background:         "#0A1A2F",
  backgroundGradient: "linear-gradient(160deg, #0A1A2F 0%, #061020 100%)",
  text:               "#FFFFFF",
  textMuted:          "rgba(255,255,255,0.60)",
  textFaint:          "rgba(255,255,255,0.25)",
  border:             "rgba(255,255,255,0.10)",
  button:             "#1E3A5F",
  buttonText:         "#FFFFFF",
  buttonHover:        "#2A4F7A",
} as const;
