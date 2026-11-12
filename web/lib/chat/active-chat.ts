// Conversa atualmente aberta no ecrã (se alguma). Usada pela notificação de
// mensagens por ler para não avisar sobre a conversa que o utilizador já está
// a ver. Módulo simples (fora do React) porque o hook do badge é um singleton.

let activeChatId: string | null = null;

export function setActiveChatId(id: string | null): void {
  activeChatId = id;
}

export function getActiveChatId(): string | null {
  return activeChatId;
}
