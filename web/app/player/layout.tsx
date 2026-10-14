import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerShell } from "@/components/player/player-shell";

const DEFAULT_PRIMARY   = "#111111";
const DEFAULT_SECONDARY = "#F28C28";
const DEFAULT_ACCENT    = "#ffffff";

function lightenHex(hex: string, ratio = 0.9): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const pad = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
  return `#${pad(r + (255 - r) * ratio)}${pad(g + (255 - g) * ratio)}${pad(b + (255 - b) * ratio)}`;
}
function contrastColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1f2937" : "#ffffff";
}

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch club colors in parallel with profile — eliminates sidebar theme flash
  const [{ data: profile }, { data: settingsRow }, { data: kitsRows }] = await Promise.all([
    supabase.from("users").select("name, role, active").eq("id", user.id).single(),
    supabase.from("club_settings").select("club_name, primary_color, secondary_color, accent_color").eq("id", "default").maybeSingle(),
    supabase.from("team_kits").select("team_name, jersey_home_color, shorts_home_color, jersey_away_color"),
  ]);

  const clubName  = settingsRow?.club_name ?? "CD Póvoa Masters";
  const clubKit   = (kitsRows ?? []).find((k: { team_name: string }) => k.team_name.toLowerCase() === clubName.toLowerCase()) as { jersey_home_color: string; shorts_home_color: string; jersey_away_color: string } | undefined;
  const primary   = clubKit?.jersey_home_color   ?? settingsRow?.primary_color   ?? DEFAULT_PRIMARY;
  const secondary = clubKit?.shorts_home_color   ?? settingsRow?.secondary_color ?? DEFAULT_SECONDARY;
  const accent    = clubKit?.jersey_away_color   ?? settingsRow?.accent_color    ?? DEFAULT_ACCENT;
  const bg        = lightenHex(primary, 0.93);
  const primaryFg = contrastColor(primary);

  const clubCss = `
    :root {
      --club-primary: ${primary};
      --club-secondary: ${secondary};
      --club-accent: ${accent};
      --club-bg: ${bg};
      --club-primary-fg: ${primaryFg};
      --club-secondary-fg: ${contrastColor(secondary)};
      --club-accent-fg: ${contrastColor(accent)};
    }
  `;

  // Sem perfil (admin original sem registo) → dashboard
  if (!profile) redirect("/dashboard");

  // Seccionista não é jogador — redirecionar para a área de jogos
  if (profile.role === "seccionista") redirect("/jogos");
  // Conta inativa: signout antes de ir para /login para evitar loop
  // (middleware veria sessão válida e redirigiria de volta para /player)
  if (!profile.active) redirect("/api/auth/signout");

  const playerName = profile.name || user.email || "Jogador";
  const userRole   = profile.role as "admin" | "treinador" | "jogador";

  return (
    <>
      {/* Inject club CSS variables before first paint to prevent sidebar theme flash */}
      <style dangerouslySetInnerHTML={{ __html: clubCss }} />
      <PlayerShell playerName={playerName} userRole={userRole}>
        {children}
      </PlayerShell>
    </>
  );
}
