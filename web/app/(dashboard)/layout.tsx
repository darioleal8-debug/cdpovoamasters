import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  /* Buscar dados do perfil do utilizador na tabela users */
  const { data: profile } = await supabase
    .from("users")
    .select("name, role, status")
    .eq("email", user.email!)
    .single();

  const userName  = profile?.name  ?? user.email ?? "Utilizador";
  const userRole  = profile?.role  ?? "jogador";
  const userEmail = user.email     ?? "";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (só desktop) */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar />
      </div>

      {/* Conteúdo principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
        />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
