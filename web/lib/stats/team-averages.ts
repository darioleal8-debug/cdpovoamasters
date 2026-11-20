/**
 * Médias por jogo de cada jogador (Resumo Estatístico da Equipa).
 * Função pura: recebe linhas de player_game_stats (só jogos oficiais terminados) e devolve
 * uma linha por jogador com médias por jogo e percentagens de lançamento calculadas sobre os totais.
 */

export interface GameStatRow {
  /** Chave de agregação: players.id (época atual) ou users.id (todas as épocas). */
  key: string;
  pts: number | null;
  fg2_made: number | null; fg2_att: number | null;
  fg3_made: number | null; fg3_att: number | null;
  ft_made: number | null; ft_att: number | null;
  reb_off: number | null; reb_def: number | null;
  ast: number | null; stl: number | null; blk: number | null; tov: number | null;
  fouls_committed: number | null; fouls_drawn: number | null;
  efficiency: number | string | null;
  seconds_played: number | null;
  plus_minus: number | null;
}

export interface PlayerAverages {
  key: string;
  games: number;
  /** Médias por jogo */
  min: number | null;
  pts: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  reb: number; rebOff: number; rebDef: number;
  ast: number; stl: number; blk: number; tov: number;
  fouls: number; foulsDrawn: number;
  eff: number;
  plusMinus: number | null;
  /** Percentagens (0–100) sobre os totais; null sem tentativas */
  fg2Pct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  /** Total de pontos acumulado */
  totalPts: number;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (made: number, att: number) => (att > 0 ? Math.round((made / att) * 1000) / 10 : null);

export function aggregateAverages(rows: GameStatRow[]): PlayerAverages[] {
  const acc = new Map<string, {
    g: number; secs: number; secsRows: number; pm: number; pmRows: number;
    pts: number; fg2m: number; fg2a: number; fg3m: number; fg3a: number; ftm: number; fta: number;
    rebOff: number; rebDef: number; ast: number; stl: number; blk: number; tov: number;
    fc: number; fd: number; eff: number;
  }>();

  for (const r of rows) {
    const a = acc.get(r.key) ?? {
      g: 0, secs: 0, secsRows: 0, pm: 0, pmRows: 0,
      pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      rebOff: 0, rebDef: 0, ast: 0, stl: 0, blk: 0, tov: 0, fc: 0, fd: 0, eff: 0,
    };
    a.g++;
    if (r.seconds_played != null && r.seconds_played > 0) { a.secs += r.seconds_played; a.secsRows++; }
    if (r.plus_minus != null) { a.pm += r.plus_minus; a.pmRows++; }
    a.pts += n(r.pts);
    a.fg2m += n(r.fg2_made); a.fg2a += n(r.fg2_att);
    a.fg3m += n(r.fg3_made); a.fg3a += n(r.fg3_att);
    a.ftm += n(r.ft_made); a.fta += n(r.ft_att);
    a.rebOff += n(r.reb_off); a.rebDef += n(r.reb_def);
    a.ast += n(r.ast); a.stl += n(r.stl); a.blk += n(r.blk); a.tov += n(r.tov);
    a.fc += n(r.fouls_committed); a.fd += n(r.fouls_drawn);
    a.eff += n(r.efficiency);
    acc.set(r.key, a);
  }

  return [...acc.entries()].map(([key, a]) => ({
    key,
    games: a.g,
    min: a.secsRows > 0 ? round1(a.secs / a.secsRows / 60) : null,
    pts: round1(a.pts / a.g),
    fg2m: round1(a.fg2m / a.g), fg2a: round1(a.fg2a / a.g),
    fg3m: round1(a.fg3m / a.g), fg3a: round1(a.fg3a / a.g),
    ftm: round1(a.ftm / a.g), fta: round1(a.fta / a.g),
    reb: round1((a.rebOff + a.rebDef) / a.g),
    rebOff: round1(a.rebOff / a.g), rebDef: round1(a.rebDef / a.g),
    ast: round1(a.ast / a.g), stl: round1(a.stl / a.g), blk: round1(a.blk / a.g), tov: round1(a.tov / a.g),
    fouls: round1(a.fc / a.g), foulsDrawn: round1(a.fd / a.g),
    eff: round1(a.eff / a.g),
    plusMinus: a.pmRows > 0 ? round1(a.pm / a.pmRows) : null,
    fg2Pct: pct(a.fg2m, a.fg2a),
    fg3Pct: pct(a.fg3m, a.fg3a),
    ftPct: pct(a.ftm, a.fta),
    totalPts: a.pts,
  }));
}
