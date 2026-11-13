import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readActiveRoleCookie } from "@/lib/auth/guards";
import { applyActiveRole } from "@/lib/auth/active-role";
import type { UserRole } from "@/types/database";

export async function requirePlayEditor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role, roles_extra, active").eq("id", user.id).maybeSingle();
  if (!profile?.active) redirect("/login?reason=inactive");
  const eff = applyActiveRole({ role: profile.role as UserRole, roles_extra: profile.roles_extra }, await readActiveRoleCookie());
  const ok = ["admin", "treinador"].includes(eff.role) || (eff.roles_extra ?? []).some((r: string) => ["admin", "treinador"].includes(r));
  if (!ok) redirect("/laboratorio");
}
