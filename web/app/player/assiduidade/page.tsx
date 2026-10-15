import { createClient } from "@/lib/supabase/server";
import { redirect }     from "next/navigation";
import { AssiduidadeClient } from "./assiduidade-client";

export const metadata = { title: "A Minha Assiduidade" };

export default async function PlayerAssiduidadePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar temporada activa
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("status", "ativa")
    .maybeSingle();

  // Todas as temporadas para o selector
  const { data: seasons } = await supabase
    .from("seasons")
    .select("id, name, status")
    .order("start_date", { ascending: false });

  return (
    <AssiduidadeClient
      activeSeasonId={activeSeason?.id ?? null}
      seasons={seasons ?? []}
    />
  );
}
