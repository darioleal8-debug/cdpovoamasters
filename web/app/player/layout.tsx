import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerShell } from "@/components/player/player-shell";
import { canReturnToDashboard } from "@/lib/auth/view-as";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, active")
    .eq("id", user.id)
    .single();

  // Sem perfil no clube → /login termina a sessão (evita ciclo /player ⇄ /dashboard)
  if (!profile) redirect("/login?reason=noprofile");

  // Seccionista não é jogador — redirecionar para a área de jogos
  if (profile.role === "seccionista") redirect("/jogos");
  if (!profile.active) redirect("/login?reason=inactive");

  const playerName = profile.name || user.email || "Jogador";

  return (
    <PlayerShell playerName={playerName} canReturnToDashboard={canReturnToDashboard(profile.role)}>
      {children}
    </PlayerShell>
  );
}
