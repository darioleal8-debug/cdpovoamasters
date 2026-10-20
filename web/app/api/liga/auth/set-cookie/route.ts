import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COOKIE_NAME = "hh_user_type";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 dias
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 1. Verificar liga_admin primeiro (maior prioridade)
  const { data: isLigaAdmin } = await supabase.rpc("is_liga_admin");
  if (isLigaAdmin) {
    const res = NextResponse.json({ ok: true, role: "liga_admin" });
    res.cookies.set(COOKIE_NAME, "liga_admin", COOKIE_OPTS);
    return res;
  }

  // 2. Verificar delegado de equipa
  const { data: membership } = await supabase
    .from("league_team_members")
    .select("id, team_id, role, league_teams(id, name, slug, sigla, locality)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) {
    const res = NextResponse.json({ ok: true, role: "league_delegate", membership });
    res.cookies.set(COOKIE_NAME, "league_delegate", COOKIE_OPTS);
    return res;
  }

  return NextResponse.json({ error: "Sem permissão de acesso à liga" }, { status: 403 });
}
