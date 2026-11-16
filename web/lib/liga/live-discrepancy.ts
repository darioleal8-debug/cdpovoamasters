/**
 * Quando as duas equipas de um jogo da liga registam a estatística ao vivo, cada uma tem a sua sessão
 * (o "nosso" lado é sempre o "home" da sessão). Os dois registos têm de coincidir:
 * pontos da equipa A na sessão A = pontos "do adversário" na sessão B, e vice-versa.
 */
export interface FinishedLiveSession {
  teamName: string;
  own: number;   // pontos da equipa que registou
  opp: number;   // pontos que essa equipa atribuiu ao adversário
}

export interface LiveDiscrepancy {
  a: FinishedLiveSession;
  b: FinishedLiveSession;
}

export function liveScoreDiscrepancy(sessions: FinishedLiveSession[]): LiveDiscrepancy | null {
  if (sessions.length < 2) return null;
  const [a, b] = sessions;
  return a.own !== b.opp || a.opp !== b.own ? { a, b } : null;
}

export function describeDiscrepancy(d: LiveDiscrepancy): string {
  return `${d.a.teamName} registou ${d.a.own}–${d.a.opp}, ${d.b.teamName} registou ${d.b.own}–${d.b.opp}`;
}
