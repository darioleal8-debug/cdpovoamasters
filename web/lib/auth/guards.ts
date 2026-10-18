import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ROLE_COOKIE, applyActiveRole } from "./active-role";
import { evaluateAccess, type AuthProfile, type RoleGroup } from "./roles";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AuthOk = { ok: true; user: User; profile: AuthProfile; supabase: ServerClient };
export type AuthFail = { ok: false; response: NextResponse };

/**
 * Autoriza o pedido atual. Sem `group` exige apenas sessão + perfil ativo.
 * O perfil é sempre procurado por id (nunca por email).
 * Aplica o papel ativo escolhido pelo utilizador (só restringe; ver active-role.ts).
 */
export async function authorize(group?: RoleGroup): Promise<AuthOk | AuthFail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: AuthProfile | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("id, role, roles_extra, active")
      .eq("id", user.id)
      .maybeSingle();
    profile = (data as AuthProfile | null) ?? null;
    if (profile) profile = applyActiveRole(profile, await readActiveRoleCookie());
  }

  const decision = evaluateAccess(!!user, profile, group);
  if (!decision.ok) {
    return { ok: false, response: NextResponse.json({ success: false, error: decision.error }, { status: decision.status }) };
  }
  return { ok: true, user: user!, profile: profile!, supabase };
}

/** Valor do cookie de papel ativo (por validar — usar sempre com applyActiveRole). */
export async function readActiveRoleCookie(): Promise<string | undefined> {
  return (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;
}
