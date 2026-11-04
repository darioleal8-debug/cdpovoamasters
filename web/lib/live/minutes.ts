/**
 * Tempo jogado por jogador, a partir dos stints em campo (player_court_stints).
 * O relógio é decrescente: um stint vale entry_clock_secs − exit_clock_secs.
 * Stints ainda abertos (exit null) no período atual contam até ao relógio atual.
 */
export interface CourtStint {
  player_id: string;
  period: number;
  entry_clock_secs: number | null;
  exit_clock_secs: number | null;
}

export function computeSecondsPlayed(
  stints: CourtStint[],
  currentPeriod: number,
  clockSecs: number,
  isLive: boolean
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of stints) {
    if (s.entry_clock_secs == null) continue;
    let exit = s.exit_clock_secs;
    if (exit == null) {
      // stint aberto: só conta no período em curso de um jogo ao vivo
      if (!isLive || s.period !== currentPeriod) continue;
      exit = Math.max(0, Math.floor(clockSecs));
    }
    const secs = Math.max(0, s.entry_clock_secs - exit);
    out.set(s.player_id, (out.get(s.player_id) ?? 0) + secs);
  }
  return out;
}

/** 754 → "12:34" */
export function formatMinutes(secs: number | undefined | null): string {
  const t = Math.max(0, Math.floor(secs ?? 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
