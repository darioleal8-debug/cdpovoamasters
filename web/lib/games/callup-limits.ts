/**
 * Limite de convocados por jogo.
 *
 * Jogos oficiais (Liga INATEL — game_type = 'official') têm um MÁXIMO de 12
 * convocados. Não há mínimo: uma convocatória pode ter menos de 12.
 * Jogos de treino/amigáveis não têm limite.
 *
 * O mesmo limite é garantido na API (POST /api/games/[id]/callups) e na base
 * de dados (trigger enforce_official_callup_limit — migration 116).
 */
export const MAX_OFFICIAL_CALLUPS = 12;

export function isOfficialGame(
  ev: { game_type?: string | null; competition?: string | null } | null | undefined,
): boolean {
  if (!ev) return false;
  if (ev.game_type === "official") return true;
  return !!ev.competition?.toLowerCase().includes("inatel");
}

/** Máximo de convocados para o jogo, ou null se não houver limite. */
export function getMaxCallups(
  ev: { game_type?: string | null; competition?: string | null } | null | undefined,
): number | null {
  return isOfficialGame(ev) ? MAX_OFFICIAL_CALLUPS : null;
}
