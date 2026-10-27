import type { SheetData, Side } from "./schema";
import { teamNameScore } from "./schema";

export interface RosterEntry {
  player_id: string;
  name: string | null;
  number: number | null;
}

/**
 * Associa jogadores lidos a jogadores do HoopHub só quando a correspondência é inequívoca:
 * número de camisola único no plantel E nome compatível (tokens partilhados).
 * Nunca sobrepõe uma associação feita manualmente.
 */
export function matchHoophubPlayers(sheet: SheetData, side: Side, roster: RosterEntry[]): SheetData {
  const byNumber = new Map<number, RosterEntry[]>();
  for (const r of roster) {
    if (r.number === null) continue;
    byNumber.set(r.number, [...(byNumber.get(r.number) ?? []), r]);
  }
  const used = new Set(sheet.players.map((p) => p.hoophubPlayerId).filter(Boolean));
  return {
    ...sheet,
    players: sheet.players.map((p) => {
      if (p.side !== side || p.hoophubPlayerId || p.number === null) return p;
      const candidates = byNumber.get(p.number) ?? [];
      if (candidates.length !== 1) return p;
      const c = candidates[0];
      if (used.has(c.player_id)) return p;
      // Nome lido vazio → número sozinho não chega para ser inequívoco
      if (!p.name.trim() || teamNameScore(p.name, c.name) < 0.5) return p;
      used.add(c.player_id);
      return { ...p, hoophubPlayerId: c.player_id };
    }),
  };
}
