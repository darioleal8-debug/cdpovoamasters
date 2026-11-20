import type { UserRole } from "@/types/database";

/** Gestão desportiva: jogos, convocatória, plantel, treinos, presenças, calendário. */
export const MANAGERS = ["admin", "treinador", "seccionista"] as const satisfies readonly UserRole[];
/** Quotas, pagamentos, recibos e finanças. */
export const FINANCE = ["admin", "tesoureiro"] as const satisfies readonly UserRole[];
/** Contas, definições do clube, temporadas. */
export const ADMIN = ["admin"] as const satisfies readonly UserRole[];

export type RoleGroup = readonly UserRole[];

export interface AuthProfile {
  id: string;
  role: UserRole;
  roles_extra: string[] | null;
  active: boolean;
}

/** Verdadeiro se o papel primário ou algum papel secundário pertence ao grupo. */
export function hasAnyRole(
  profile: Pick<AuthProfile, "role" | "roles_extra">,
  group: RoleGroup
): boolean {
  if (group.includes(profile.role)) return true;
  return (profile.roles_extra ?? []).some((r) => (group as readonly string[]).includes(r));
}

export function isActiveProfile(profile: AuthProfile | null | undefined): profile is AuthProfile {
  return !!profile && profile.active === true;
}

export type AccessDecision = { ok: true } | { ok: false; status: 401 | 403; error: string };

/** Decisão pura de acesso: sessão → perfil existente e ativo → papel no grupo (se exigido). */
export function evaluateAccess(
  hasSession: boolean,
  profile: AuthProfile | null,
  group: RoleGroup | undefined
): AccessDecision {
  if (!hasSession) return { ok: false, status: 401, error: "Não autenticado." };
  if (!profile) return { ok: false, status: 403, error: "Conta sem perfil no clube." };
  if (!isActiveProfile(profile)) return { ok: false, status: 403, error: "Conta desativada." };
  if (group && !hasAnyRole(profile, group)) {
    return { ok: false, status: 403, error: "Sem permissão para esta ação." };
  }
  return { ok: true };
}

/** Funções que um administrador de clube pode atribuir a qualquer conta (incl. jogadores). */
export const ASSIGNABLE_ROLES = ["admin", "treinador", "seccionista", "tesoureiro", "jogador"] as const satisfies readonly UserRole[];

/**
 * Valida as funções adicionais pedidas para uma conta: só valores atribuíveis, sem duplicados
 * e sem repetir a função principal. Devolve `null` se o pedido for inválido.
 */
export function sanitizeRolesExtra(primary: string, extras: unknown): string[] | null {
  if (!Array.isArray(extras)) return null;
  const allowed: readonly string[] = ASSIGNABLE_ROLES;
  const out: string[] = [];
  for (const r of extras) {
    if (typeof r !== "string" || !allowed.includes(r)) return null;
    if (r !== primary && !out.includes(r)) out.push(r);
  }
  return out;
}
