import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: member } = await auth.supabase
    .from("league_team_members")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Delegado não encontrado" }, { status: 404 });
  }

  const { error } = await auth.supabase
    .from("league_team_members")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Apagar conta auth — delegados não têm perfil no clube
  const adminClient = await createAdminClient();
  await adminClient.auth.admin.deleteUser(member.user_id);

  return NextResponse.json({ ok: true });
}
