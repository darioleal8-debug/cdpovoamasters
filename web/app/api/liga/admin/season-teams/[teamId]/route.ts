import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/liga/admin/season-teams/[teamId]
// Ativa/desativa uma equipa e/ou define a sua série (A, B, C…) na temporada atual da Liga INATEL.
// Body: { active?: boolean, series?: string | null }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { teamId } = await params;
  const body = await req.json().catch(() => null);
  const hasActive = typeof body?.active === "boolean";
  const hasSeries = body && "series" in body;
  if (!hasActive && !hasSeries) {
    return NextResponse.json({ error: "active (boolean) ou series obrigatório" }, { status: 400 });
  }

  let series: string | null | undefined;
  if (hasSeries) {
    if (body.series === null || body.series === "") {
      series = null;
    } else if (typeof body.series === "string" && /^[A-Za-z]$/.test(body.series.trim())) {
      series = body.series.trim().toUpperCase();
    } else {
      return NextResponse.json({ error: "series deve ser uma letra (A, B, C…) ou null" }, { status: 400 });
    }
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
      {
        competition_id: comp.id,
        team_id: teamId,
        ...(hasActive ? { active: body.active } : {}),
        ...(series !== undefined ? { series } : {}),
      },
      { onConflict: "competition_id,team_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/liga-inatel", "layout");
  return NextResponse.json({ ok: true });
}
