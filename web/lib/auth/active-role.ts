import type { UserRole } from "@/types/database";

/**
 * Papel ativo: quem tem vários papéis (ex.: admin + treinador + jogador) escolhe com qual
 * está a usar a app. A escolha vive num cookie e é validada contra os papéis reais em cada
 * pedido, por isso só pode restringir — nunca dá um papel que a conta não tenha.
 * Nota: é um modo de utilização, não uma fronteira de segurança; a RLS usa sempre os papéis reais.
 */
export const ACTIVE_ROLE_COOKIE = "hh_active_role";

type RoleSource = { role: UserRole; roles_extra: string[] | null };

export function availableRoles(profile: RoleSource): UserRole[] {
  const out: UserRole[] = [profile.role];
  for (const r of profile.roles_extra ?? []) {
    if (!out.includes(r as UserRole)) out.push(r as UserRole);
  }
  return out;
}

export function applyActiveRole<T extends RoleSource>(profile: T, chosen: string | undefined | null): T {
  if (!chosen || !availableRoles(profile).includes(chosen as UserRole)) return profile;
  return { ...profile, role: chosen as UserRole, roles_extra: [] };
}

export function homeForRole(role: string): string {
  if (role === "jogador") return "/player";
  if (role === "seccionista") return "/jogos";
  return "/dashboard";
}

export function parseActiveRoleRequest(
  profile: RoleSource,
  body: unknown
): { ok: true; role: UserRole } | { ok: false } {
  const role = (body as { role?: unknown } | null)?.role;
  if (typeof role !== "string" || !availableRoles(profile).includes(role as UserRole)) return { ok: false };
  return { ok: true, role: role as UserRole };
}
