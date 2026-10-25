import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/liga/admin/season-teams/[teamId]
// Ativa ou desativa uma equipa para a temporada atual da Liga INATEL.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { teamId } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "active (boolean) obrigatório" }, { status: 400 });
  }

  const adminClient = await createAdminClient();

  const { data: comp } = await adminClient
    .from("competitions")
    .select("id")
    .eq("slug", "liga-inatel")
    .single();

  if (!comp) return NextResponse.json({ error: "Competição não encontrada" }, { status: 404 });

  const { error } = await adminClient
    .from("season_teams")
    .upsert(
      { competition_id: comp.id, team_id: teamId, active: body.active },
      { onConflict: "competition_id,team_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/liga-inatel", "layout");
  return NextResponse.json({ ok: true });
}
