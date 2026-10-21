import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/liga/admin/team-access
// Devolve todas as equipas não-placeholder com os seus membros e emails
export async function GET() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = await createAdminClient();

  const [teamsRes, membersRes] = await Promise.all([
    adminClient
      .from("league_teams")
      .select("id, name, slug, sigla, logo_url")
      .eq("is_placeholder", false)
      .order("name"),
    adminClient
      .from("league_team_members")
      .select("id, user_id, team_id, role, created_at, created_by")
      .order("created_at"),
  ]);

  const teams = teamsRes.data ?? [];
  const members = membersRes.data ?? [];

  // Recolher user_ids únicos para fazer lookup de emails
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
// Cria utilizador Auth + insere em league_team_members
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as {
    team_id: string;
    email: string;
    password: string;
  };

  if (!body.team_id || !body.email || !body.password) {
    return NextResponse.json(
      { error: "team_id, email e password são obrigatórios" },
      { status: 400 }
    );
  }
  if (body.password.length < 8) {
    return NextResponse.json(
      { error: "A password tem de ter pelo menos 8 caracteres" },
      { status: 400 }
    );
  }

  const adminClient = await createAdminClient();

  // Verificar que a equipa existe e não é placeholder
  const { data: team } = await adminClient
    .from("league_teams")
    .select("id, name, is_placeholder")
    .eq("id", body.team_id)
    .single();

  if (!team || team.is_placeholder) {
    return NextResponse.json({ error: "Equipa não encontrada" }, { status: 404 });
  }

  // Criar utilizador Auth com email já confirmado
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Erro ao criar utilizador" },
      { status: 500 }
    );
  }

  // Inserir em league_team_members
  const { error: insertErr } = await adminClient.from("league_team_members").insert({
    user_id: created.user.id,
    team_id: body.team_id,
    role: "team_manager",
    created_by: auth.user.id,
  });

  if (insertErr) {
    // Tentar reverter a criação do utilizador
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user_id: created.user.id,
    email: created.user.email,
    team_name: team.name,
  });
}
