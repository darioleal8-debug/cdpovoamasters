import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;

  const adminClient = await createAdminClient();

  const { data: current } = await adminClient
    .from("events")
    .select("id, deleted_at")
    .eq("id", eventId)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  }

  if (!current.deleted_at) {
    return NextResponse.json({ error: "Jogo não está eliminado" }, { status: 409 });
  }

  const { error } = await adminClient
    .from("events")
    .update({ deleted_at: null })
    .eq("id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await adminClient.from("game_audit_log").insert({
    event_id: eventId,
    action: "restore",
    altered_by: auth.user.id,
  });

  return NextResponse.json({ ok: true });
}
