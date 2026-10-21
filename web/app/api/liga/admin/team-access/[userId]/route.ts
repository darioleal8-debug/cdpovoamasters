import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/liga/admin/team-access/[userId]
// Redefine a password de um delegado de equipa
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  const body = (await req.json()) as { password: string };

  if (!body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: "A nova password tem de ter pelo menos 8 caracteres" },
      { status: 400 }
    );
  }

  const adminClient = await createAdminClient();

  // Garantir que este userId pertence a league_team_members (não é um utilizador arbitrário)
  const { data: membership } = await adminClient
    .from("league_team_members")
    .select("id, team_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Utilizador não encontrado nos delegados de equipa" },
      { status: 404 }
    );
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: body.password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/liga/admin/team-access/[userId]
// Remove o acesso: apaga da league_team_members e elimina o utilizador Auth
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { userId } = await params;

  const adminClient = await createAdminClient();

  // Garantir que este userId pertence a league_team_members
  const { data: membership } = await adminClient
    .from("league_team_members")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Utilizador não encontrado nos delegados de equipa" },
      { status: 404 }
    );
  }

  // Remover de league_team_members
  await adminClient.from("league_team_members").delete().eq("user_id", userId);

  // Eliminar utilizador do Auth
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
