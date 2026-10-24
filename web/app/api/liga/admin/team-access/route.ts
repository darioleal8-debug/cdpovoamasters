import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSecurePassword } from "@/lib/liga/password";
import { sendLigaCredentialsEmail } from "@/lib/liga/email-credentials";

// GET /api/liga/admin/team-access
export async function GET() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = await createAdminClient();

  const [teamsRes, membersRes] = await Promise.all([
    adminClient
      .from("league_teams")
      .select("id, name, slug, sigla, logo_url, primary_color, secondary_color, kit_description")
      .eq("is_placeholder", false)
      .order("name"),
    adminClient
      .from("league_team_members")
      .select("id, user_id, team_id, role, created_at, created_by")
      .order("created_at"),
  ]);

  const teams = teamsRes.data ?? [];
  const members = membersRes.data ?? [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const emailMap: Record<string, string> = {};
  for (const uid of userIds) {
    const { data } = await adminClient.auth.admin.getUserById(uid);
    if (data.user?.email) emailMap[uid] = data.user.email;
  }

  const result = teams.map((t) => ({
    team_id: t.id,
    team_name: t.name,
    team_slug: t.slug,
    team_sigla: t.sigla,
    logo_url: t.logo_url,
    primary_color: t.primary_color ?? null,
    secondary_color: t.secondary_color ?? null,
    kit_description: t.kit_description ?? null,
    members: members
      .filter((m) => m.team_id === t.id)
      .map((m) => ({
        id: m.id,
        user_id: m.user_id,
        email: emailMap[m.user_id] ?? "(email desconhecido)",
        role: m.role,
        created_at: m.created_at,
      })),
  }));

  return NextResponse.json({ teams: result });
}

// POST /api/liga/admin/team-access
// Cria utilizador Auth com password automática + envia credenciais por email
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { team_id: string; email: string };

  if (!body.team_id || !body.email?.trim()) {
    return NextResponse.json(
      { error: "team_id e email são obrigatórios" },
      { status: 400 }
    );
  }

  const adminClient = await createAdminClient();

  const { data: team } = await adminClient
    .from("league_teams")
    .select("id, name, is_placeholder")
    .eq("id", body.team_id)
    .single();

  if (!team || team.is_placeholder) {
    return NextResponse.json({ error: "Equipa não encontrada" }, { status: 404 });
  }

  const password = generateSecurePassword();

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: body.email.trim(),
    password,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });

  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Erro ao criar utilizador" },
      { status: 500 }
    );
  }

  const { error: insertErr } = await adminClient.from("league_team_members").insert({
    user_id: created.user.id,
    team_id: body.team_id,
    role: "delegate",
    created_by: auth.user.id,
  });

  if (insertErr) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Enviar credenciais por email — rollback se falhar
  const emailResult = await sendLigaCredentialsEmail({
    to: body.email.trim(),
    password,
    teamName: team.name,
  });

  if (!emailResult.ok) {
    // Reverter: apagar utilizador e membro
    await adminClient.from("league_team_members").delete().eq("user_id", created.user.id);
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: `Utilizador criado mas email falhou: ${emailResult.error}. Acesso revertido.` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    user_id: created.user.id,
    email: created.user.email,
    team_name: team.name,
  });
}
