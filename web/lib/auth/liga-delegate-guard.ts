import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type DelegateOk = { ok: true; user: User; supabase: ServerClient; teamId: string; teamName: string };
export type DelegateFail = { ok: false; response: NextResponse };

/**
 * Autoriza um delegado de equipa da Liga: sessão + registo em league_team_members.
 * A equipa vem sempre da associação do utilizador (nunca de dados enviados pelo cliente).
 */
export async function authorizeLeagueDelegate(): Promise<DelegateOk | DelegateFail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("league_team_members")
    .select("team_id, league_teams(name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: "Sem acesso de equipa" }, { status: 403 }) };
  }

  const teamName = (membership.league_teams as unknown as { name: string } | null)?.name ?? "";
  return { ok: true, user, supabase, teamId: membership.team_id as string, teamName };
}
