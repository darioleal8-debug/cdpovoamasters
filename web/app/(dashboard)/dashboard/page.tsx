import { redirect }     from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { OverviewClient } from "../overview-client";

export const metadata: Metadata = { title: "Hoje — CD Póvoa Masters" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name, year, status")
    .eq("status", "ativa")
    .maybeSingle();

  return <OverviewClient seasonId={activeSeason?.id ?? null} />;
}
