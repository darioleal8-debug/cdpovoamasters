// Quem gere o clube e também joga pode alternar para a área do jogador (/player),
// que mostra os dados da sua própria ficha (players.user_id).
// O seccionista é redirecionado de /player (app/player/layout.tsx), por isso fica de fora.
export function canViewAsPlayer(role: string, hasLinkedPlayer: boolean): boolean {
  return hasLinkedPlayer && role !== "jogador" && role !== "seccionista";
}

// Na área do jogador, qualquer papel de gestão tem caminho de volta ao dashboard.
export function canReturnToDashboard(role: string): boolean {
  return role !== "jogador";
}
