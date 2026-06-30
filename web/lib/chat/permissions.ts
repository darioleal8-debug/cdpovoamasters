export type ChatRole = "admin" | "treinador" | "jogador" | "seccionista";

export function canDirectMessage(callerRole: ChatRole, targetRole: ChatRole): boolean {
  if (callerRole === "admin") return true;
  if (callerRole === "treinador") return targetRole === "jogador" || targetRole === "admin";
  if (callerRole === "jogador") return targetRole === "treinador" || targetRole === "admin";
  // seccionista não pode iniciar DMs
  return false;
}

export function canCreateGroup(callerRole: ChatRole): boolean {
  return callerRole === "admin" || callerRole === "treinador";
}

export function canPostAnnouncement(callerRole: ChatRole): boolean {
  return callerRole === "admin";
}

export type ChatPostPolicy = "all" | "admin_only";

export function canPostInChat(callerRole: ChatRole, postPolicy: ChatPostPolicy): boolean {
  return postPolicy === "all" || callerRole === "admin";
}

// Só o administrador gere as permissões (post_policy) de cada conversa.
export function canManageChatPermissions(callerRole: ChatRole): boolean {
  return callerRole === "admin";
}
