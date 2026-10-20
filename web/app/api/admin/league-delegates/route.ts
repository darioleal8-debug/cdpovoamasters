import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("league_team_members")
    .select("id, user_id, role, created_at, league_teams(id, name, sigla)")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delegates: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const { email, team_id } = (await req.json()) as { email: string; team_id: string };

  if (!email?.trim() || !team_id) {
    return NextResponse.json({ error: "email e team_id são obrigatórios" }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? "https://hoophub.pt";
  const adminClient = await createAdminClient();

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${origin}/liga-inatel/equipa/login` }
  );

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const { data: member, error: memberError } = await auth.supabase
    .from("league_team_members")
    .insert({
      user_id: inviteData.user.id,
      team_id,
      role: "delegate",
      created_by: auth.user.id,
    })
    .select("id, user_id, role, created_at, league_teams(id, name, sigla)")
    .single();

  if (memberError) {
    await adminClient.auth.admin.deleteUser(inviteData.user.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ member }, { status: 201 });
}
