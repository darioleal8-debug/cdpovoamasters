import "server-only";
import { NextResponse } from "next/server";
import { createRawServiceClient } from "@/lib/supabase/service-raw";
import { authorize, type AuthOk } from "./guards";
import { ADMIN } from "./roles";

type AdminDb = ReturnType<typeof createRawServiceClient>;
export type MasterOk = AuthOk & { admin: AdminDb };

/**
 * Só o Master Admin (tabela platform_admins) passa. Exige sessão + conta admin ativa.
 * A tabela só é legível pelo próprio (RLS), por isso a verificação usa a sessão do utilizador.
 */
export async function authorizeMaster(): Promise<MasterOk | { ok: false; response: NextResponse }> {
  const authz = await authorize(ADMIN);
  if (!authz.ok) return authz;
  const { data } = await authz.supabase
    .from("platform_admins").select("user_id").eq("user_id", authz.user.id).maybeSingle();
  if (!data) {
    return { ok: false, response: NextResponse.json({ error: "Apenas o Master Admin." }, { status: 403 }) };
  }
  return { ...authz, admin: createRawServiceClient() };
}

export function slugify(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
