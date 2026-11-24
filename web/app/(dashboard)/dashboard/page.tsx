import { redirect }     from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { OverviewClient } from "../overview-client";
import { MasterAccessRequestsCard } from "@/components/dashboard/master-access-requests-card";
import { activeSeasonForClub, clubIdForUser } from "@/lib/auth/club";

export const metadata: Metadata = { title: "Hoje — CD Póvoa Masters" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Temporada ativa do clube do utilizador (o Master Admin vê as de todos os clubes por RLS)
  const clubId = await clubIdForUser(supabase, user.id);
  const activeSeason = await activeSeasonForClub(supabase, clubId, "id, name, year, status");

  // Master Admin: vê o aviso de pedidos de acesso pendentes (a tabela platform_admins só é legível pelo próprio)
  const { data: masterRow } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

  return (
    <div className="space-y-6">
      {masterRow && <MasterAccessRequestsCard />}
      <OverviewClient seasonId={activeSeason?.id ?? null} />
    </div>
  );
}
