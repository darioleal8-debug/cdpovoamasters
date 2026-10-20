import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DELEGATE_COOKIE = "hh_user_type";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("league_team_members")
    .select("id, team_id, role, league_teams(id, name, slug, sigla, locality)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Sem permissão de delegado" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true, membership });
  res.cookies.set(DELEGATE_COOKIE, "league_delegate", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  });
  return res;
}
