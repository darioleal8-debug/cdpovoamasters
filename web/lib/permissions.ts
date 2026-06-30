import type { UserRole } from "@/types/database";

export function canManageContent(role: UserRole): boolean {
  return role === "admin" || role === "treinador";
}
