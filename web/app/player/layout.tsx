import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerShell } from "@/components/player/player-shell";
import { readActiveRoleCookie } from "@/lib/auth/guards";
import { applyActiveRole, availableRoles } from "@/lib/auth/active-role";
import type { UserRole } from "@/types/database";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, roles_extra, active")
    .eq("id", user.id)
    .single();

  // Sem perfil no clube → /login termina a sessão (evita ciclo /player ⇄ /dashboard)
  if (!profile) redirect("/login?reason=noprofile");

  if (!profile.active) redirect("/login?reason=inactive");

  const real      = { role: profile.role as UserRole, roles_extra: profile.roles_extra };
  const roles     = availableRoles(real);
  const effective = applyActiveRole(real, await readActiveRoleCookie());

  // Seccionista não é jogador — redirecionar para a área de jogos
  if (effective.role === "seccionista") redirect("/jogos");

  const playerName = profile.name || user.email || "Jogador";

  return (
    <PlayerShell playerName={playerName} availableRoles={roles} activeRole={effective.role}>
      {children}
    </PlayerShell>
  );
}
