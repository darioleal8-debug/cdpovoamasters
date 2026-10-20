import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LigaAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/liga-inatel/equipa/login?msg=admin_required");
  }

  const { data: isAdmin } = await supabase.rpc("is_liga_admin");

  if (!isAdmin) {
    redirect("/liga-inatel/equipa/login?msg=admin_required");
  }

  return <>{children}</>;
}
