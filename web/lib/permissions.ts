import type { UserRole } from "@/types/database";
import { hasAnyRole, MANAGERS } from "@/lib/auth/roles";

/** Gestão de conteúdo desportivo (notas de treino, etc.) — mesma matriz que MANAGERS. */
export function canManageContent(role: UserRole): boolean {
  return hasAnyRole({ role, roles_extra: [] }, MANAGERS);
}
