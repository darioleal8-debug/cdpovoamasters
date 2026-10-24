import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/liga/admin/teams/[teamId]
// Actualiza dados do equipamento de uma equipa (primary_color, secondary_color, kit_description, logo_url)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { teamId } = await params;
  const body = (await req.json()) as {
    primary_color?: string | null;
    secondary_color?: string | null;
    kit_description?: string | null;
    logo_url?: string | null;
  };

  const allowed = ["primary_color", "secondary_color", "kit_description", "logo_url"] as const;
  const updates: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in body) {
      const val = body[key];
      updates[key] = val ? String(val).slice(0, key === "kit_description" ? 300 : 100) : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido fornecido" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { error } = await admin
    .from("league_teams")
    .update(updates)
    .eq("id", teamId)
    .eq("is_placeholder", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
