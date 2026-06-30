import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerSidebar } from "@/components/player/player-sidebar";

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
  if (!profile.active) redirect("/login");

  const playerName = profile.name || user.email || "Jogador";
  const userRole   = profile.role as "admin" | "treinador" | "jogador";

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:flex lg:shrink-0">
        <PlayerSidebar playerName={playerName} userRole={userRole} />
      </div>
      <main className="flex-1 overflow-y-auto bg-background p-6">
        {children}
      </main>
    </div>
  );
}
