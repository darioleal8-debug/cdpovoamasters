import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GameSheetReview } from "@/components/liga/game-sheet-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisão do boletim", robots: { index: false } };

/** Revisão do boletim importado com IA — delegado da equipa ou admin da liga. */
export default async function GameSheetReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/liga-inatel/equipa/login");

  const [{ data: membership }, { data: isLigaAdmin }] = await Promise.all([
    supabase.from("league_team_members").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("is_liga_admin"),
  ]);
  if (!membership && !isLigaAdmin) redirect("/liga-inatel/equipa/login");

  // RLS: só devolve a importação à equipa dona ou ao admin da liga
  const { data: row } = await supabase.from("game_sheet_imports").select("id").eq("id", importId).maybeSingle();
  if (!row) notFound();

  return (
    <GameSheetReview
      importId={importId}
      backHref={membership ? "/liga-inatel/equipa#resultados" : "/liga-inatel/admin"}
    />
  );
}
