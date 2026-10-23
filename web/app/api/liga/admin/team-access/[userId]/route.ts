import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSecurePassword } from "@/lib/liga/password";
import { sendLigaCredentialsEmail } from "@/lib/liga/email-credentials";

// PATCH /api/liga/admin/team-access/[userId]
// Regenera a password de um delegado e envia as novas credenciais por email
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  const adminClient = await createAdminClient();

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

  const { data: userRecord } = await adminClient.auth.admin.getUserById(userId);
  const email = userRecord?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Não foi possível obter o email do utilizador" }, { status: 500 });
  }

  const { data: teamRecord } = await adminClient
    .from("league_teams")
    .select("name")
    .eq("id", membership.team_id)
    .single();

  const password = generateSecurePassword();

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { must_change_password: true },
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const emailResult = await sendLigaCredentialsEmail({
    to: email,
    password,
    teamName: teamRecord?.name ?? "equipa",
    isReset: true,
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      { error: `Password atualizada mas email falhou: ${emailResult.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/liga/admin/team-access/[userId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  const adminClient = await createAdminClient();

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

  await adminClient.from("league_team_members").delete().eq("user_id", userId);

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
