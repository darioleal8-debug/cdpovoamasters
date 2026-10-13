export interface PeriodScore {
  period: number;
  home_score: number;
  away_score: number;
}

/**
 * game_period_scores guarda o resultado ACUMULADO no fim de cada período.
 * Para mostrar "P1, P2…" é preciso o parcial: acumulado − acumulado do período anterior (STA-08).
 */
export function toPeriodPartials<T extends PeriodScore>(cumulative: T[]): T[] {
  const sorted = [...cumulative].sort((a, b) => a.period - b.period);
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    return {
      ...p,
      home_score: p.home_score - (prev?.home_score ?? 0),
      away_score: p.away_score - (prev?.away_score ?? 0),
    };
  });
}
