import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerShell } from "@/components/player/player-shell";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, active")
    .eq("id", user.id)
    .single();

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
    <PlayerShell playerName={playerName} userRole={userRole}>
      {children}
    </PlayerShell>
  );
}
