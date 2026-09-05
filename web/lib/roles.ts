import type { UserRole } from "@/types/database";

export interface RoleHolder {
  role: UserRole;
  roles_extra: string[];
}

/** Verifica se o utilizador tem um determinado role (primário ou secundário). */
export function hasRole(user: RoleHolder, role: UserRole): boolean {
  return user.role === role || (user.roles_extra ?? []).includes(role);
}

/** Verdadeiro se o utilizador tem role de jogador (primário ou secundário). */
export function isPlayer(user: RoleHolder): boolean {
  return hasRole(user, "jogador");
}

/** Todos os roles efetivos do utilizador (sem duplicados). */
export function effectiveRoles(user: RoleHolder): UserRole[] {
  const all: UserRole[] = [user.role];
  for (const r of user.roles_extra ?? []) {
    if (r !== user.role) all.push(r as UserRole);
  }
  return all;
}

/** Verdadeiro se o utilizador tem pelo menos um dos roles exigidos. */
export function canAccess(user: RoleHolder, required: UserRole[]): boolean {
  return required.some((r) => hasRole(user, r));
}
