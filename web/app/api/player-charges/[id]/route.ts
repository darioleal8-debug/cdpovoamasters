import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { FINANCE } from "@/lib/auth/roles";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// DELETE /api/player-charges/:id — remove um registo (volta a "por registar").
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(FINANCE);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ error: "Conta sem clube ativo." }, { status: 403 });

  const db = await createAdminClient();
  const { data, error } = await db
    .from("player_charges").delete().eq("id", id).eq("club_id", clubId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Registo não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
