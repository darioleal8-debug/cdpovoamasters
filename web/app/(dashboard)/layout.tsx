import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { UserRole } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Página pública (ex: landing page em /) — sem sidebar nem header */
  if (!user) {
    return <>{children}</>;
  }

  /* Buscar dados do perfil do utilizador na tabela users */
  const { data: profile } = await supabase
    .from("users")
    .select("name, role, active, roles_extra")
    .eq("id", user.id)
    .maybeSingle();

  // Sem perfil → auth existe mas public.users não tem este utilizador
  if (!profile) {
    redirect("/login?reason=noprofile");
  }

  // Conta desativada: o /login termina a sessão (evita ciclo /player ⇄ /login ⇄ /dashboard)
  if (!profile.active) {
    redirect("/login?reason=inactive");
  }

  const userName      = profile.name       ?? user.email ?? "Utilizador";
  const userRole      = profile.role       as UserRole;
  const userRolesExtra = (profile.roles_extra ?? []) as UserRole[];
  const userEmail     = user.email         ?? "";

  // Jogadores (role primário) pertencem à área do jogador.
  // Quem tem jogador como role secundário (ex: admin+jogador) fica no dashboard.
  if (userRole === "jogador") {
    redirect("/player");
  }

  return (
    <DashboardShell
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      userRolesExtra={userRolesExtra}
    >
      {children}
    </DashboardShell>
  );
}
