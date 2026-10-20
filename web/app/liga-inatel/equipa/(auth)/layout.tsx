import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DelegateAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/liga-inatel/equipa/login");
  }

  const { data: membership } = await supabase
    .from("league_team_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/liga-inatel/equipa/login");
  }

  return <>{children}</>;
}
