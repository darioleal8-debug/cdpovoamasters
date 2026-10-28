/**
 * Factos verificáveis para a notícia, calculados de forma determinística a partir dos dados
 * APROVADOS (parciais, resultado, estatísticas confirmadas). O modelo de linguagem só pode
 * escrever sobre o que está aqui.
 */

export interface NewsFactsInput {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  periods: { periodo: number; home_points: number; away_points: number }[];
  players: { nome: string; side: "home" | "away"; pontos: number; triplos?: number | null; lances_livres?: number | null }[];
  unattributed?: { home: number | null; away: number | null } | null;
}

export interface NewsFacts {
  lines: string[];
  /** Pares de pontuação que a notícia pode citar (final, parciais, acumulados) */
  allowedScores: Set<string>;
  periodsConsistent: boolean;
  /** true só se os pontos individuais lidos da folha batem certo com o resultado das duas equipas */
  playerPointsReliable: boolean;
  /** Nomes de jogadores que a notícia NÃO pode referir (preenchido quando a leitura individual não é fiável) */
  forbiddenPlayerNames: string[];
}

/**
 * Os pontos individuais só são fiáveis quando, para CADA equipa, a soma dos pontos dos jogadores
 * é exatamente igual ao resultado da equipa e não há pontos por atribuir. Caso contrário, o
 * DeepSeek não conseguiu ler corretamente a coluna de pontos da folha de jogo.
 */
export function playerPointsReliable(i: {
  homeScore: number;
  awayScore: number;
  players: { side: "home" | "away" | string; pontos: number | null }[];
  unattributed?: { home: number | null; away: number | null } | null;
}): boolean {
  if (!i.players.some((p) => (p.pontos ?? 0) > 0)) return false;
  if ((i.unattributed?.home ?? 0) > 0 || (i.unattributed?.away ?? 0) > 0) return false;
  const sum = (side: "home" | "away") =>
    i.players.filter((p) => p.side === side).reduce((s, p) => s + (p.pontos ?? 0), 0);
  return sum("home") === i.homeScore && sum("away") === i.awayScore;
}

const label = (p: number) => (p <= 4 ? `${p}.º período` : `prolongamento${p > 5 ? ` ${p - 4}` : ""}`);

export function buildNewsFacts(i: NewsFactsInput): NewsFacts {
  const lines: string[] = [];
  const allowed = new Set<string>();
  const add = (a: number, b: number) => { allowed.add(`${a}-${b}`); allowed.add(`${b}-${a}`); };
  add(i.homeScore, i.awayScore);

  const winner = i.homeScore > i.awayScore ? i.home : i.away;
  const margin = Math.abs(i.homeScore - i.awayScore);
  lines.push(`Resultado final: ${i.home} ${i.homeScore}-${i.awayScore} ${i.away}. Vencedor: ${winner} por ${margin} ponto(s).`);

  const periods = [...i.periods].sort((a, b) => a.periodo - b.periodo);
  const sumH = periods.reduce((s, p) => s + p.home_points, 0);
  const sumA = periods.reduce((s, p) => s + p.away_points, 0);
  const periodsConsistent = periods.length > 0 && sumH === i.homeScore && sumA === i.awayScore;

  if (periodsConsistent) {
    let ch = 0;
    let ca = 0;
    lines.push("Evolução por período (parcial do período | resultado acumulado no fim do período):");
    let biggest: { p: number; team: string; m: number } | null = null;
    const leaders: string[] = [];
    for (const p of periods) {
      ch += p.home_points;
      ca += p.away_points;
      add(p.home_points, p.away_points);
      add(ch, ca);
      const leader = ch === ca ? "empate" : ch > ca ? `${i.home} à frente por ${ch - ca}` : `${i.away} à frente por ${ca - ch}`;
      leaders.push(leader);
      lines.push(`- ${label(p.periodo)}: ${p.home_points}-${p.away_points} | ${ch}-${ca} (${leader})`);
      const m = Math.abs(p.home_points - p.away_points);
      if (m > 0 && (!biggest || m > biggest.m)) biggest = { p: p.periodo, team: p.home_points > p.away_points ? i.home : i.away, m };
    }
    if (biggest) lines.push(`Maior diferença num período: ${biggest.team} venceu o ${label(biggest.p)} por ${biggest.m}.`);

    // Recuperação demonstrada pelos parciais (vencedor em desvantagem no fim do penúltimo período)
    if (periods.length >= 2) {
      let bh = 0;
      let ba = 0;
      for (const p of periods.slice(0, -1)) { bh += p.home_points; ba += p.away_points; }
      const winnerHome = i.homeScore > i.awayScore;
      const deficit = winnerHome ? ba - bh : bh - ba;
      const last = periods[periods.length - 1];
      if (deficit > 0) {
        lines.push(`Reviravolta comprovada pelos parciais: ${winner} perdia por ${deficit} antes do ${label(last.periodo)} e venceu esse período ${winnerHome ? last.home_points : last.away_points}-${winnerHome ? last.away_points : last.home_points}.`);
      } else if (deficit === 0) {
        lines.push(`O jogo estava empatado antes do ${label(last.periodo)}, decidido nesse período.`);
      }
    }
    if (periods.some((p) => p.periodo > 4)) lines.push("Houve prolongamento.");
    lines.push("Nota: a folha de jogo não regista a ordem dos cestos entre equipas dentro de cada período — não descrevas parciais/corridas dentro de um período nem trocas de liderança que não constem acima.");
  } else if (periods.length > 0) {
    lines.push("Parciais disponíveis mas inconsistentes com o resultado final — NÃO os uses.");
  } else {
    lines.push("Sem parciais por período — não descrevas a evolução do marcador.");
  }

  const reliable = playerPointsReliable(i);
  const forbiddenPlayerNames: string[] = [];

  if (reliable) {
    const scorers = (side: "home" | "away") =>
      i.players.filter((p) => p.side === side && p.pontos > 0).sort((a, b) => b.pontos - a.pontos).slice(0, 3);
    for (const side of ["home", "away"] as const) {
      const team = side === "home" ? i.home : i.away;
      const top = scorers(side);
      if (top.length) {
        lines.push(`Marcadores confirmados ${team}: ${top.map((p) => `${p.nome} ${p.pontos} pts${p.triplos ? ` (${p.triplos} triplo${p.triplos > 1 ? "s" : ""})` : ""}`).join(", ")}.`);
      }
    }
  } else if (i.players.some((p) => p.pontos > 0)) {
    // Leitura falhada: a soma dos pontos individuais não coincide com o resultado
    forbiddenPlayerNames.push(...i.players.map((p) => p.nome.trim()).filter((n) => n.length >= 4));
    lines.push("Os pontos individuais lidos da folha de jogo NÃO coincidem com o resultado das equipas (leitura não fiável) — NÃO menciones jogadores, marcadores nem pontuações individuais. Constrói a notícia à volta dos parciais e da posição de cada equipa na classificação.");
  } else {
    lines.push("Sem estatísticas individuais confirmadas — não menciones marcadores individuais.");
  }

  return { lines, allowedScores: allowed, periodsConsistent, playerPointsReliable: reliable, forbiddenPlayerNames };
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Nomes de jogadores proibidos que aparecem no texto (comparação sem acentos/maiúsculas). */
export function mentionedPlayers(text: string, names: string[]): string[] {
  const t = fold(text);
  return [...new Set(names)].filter((n) => {
    const re = new RegExp(`(^|[^a-z0-9])${fold(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    return re.test(t);
  });
}

/** Pontuações do tipo "53-55" citadas no texto que não constam dos factos. */
export function unknownScores(text: string, allowed: Set<string>): string[] {
  // ignora datas (2026-10-20) e horas (21:30)
  const found = (text.match(/(?<![\d\-/:])\d{1,3}\s*[-–—]\s*\d{1,3}(?![\d\-/:])/g) ?? []);
  return found
    .map((f) => f.replace(/\s*[-–—]\s*/, "-"))
    .filter((f) => !allowed.has(f));
}
