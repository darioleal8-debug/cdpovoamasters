import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { evaluateAccess, type AuthProfile, type RoleGroup } from "./roles";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AuthOk = { ok: true; user: User; profile: AuthProfile; supabase: ServerClient };
export type AuthFail = { ok: false; response: NextResponse };

/**
 * Autoriza o pedido atual. Sem `group` exige apenas sessão + perfil ativo.
 * O perfil é sempre procurado por id (nunca por email).
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
  }

  const decision = evaluateAccess(!!user, profile, group);
  if (!decision.ok) {
    return { ok: false, response: NextResponse.json({ success: false, error: decision.error }, { status: decision.status }) };
  }
  return { ok: true, user: user!, profile: profile!, supabase };
}
