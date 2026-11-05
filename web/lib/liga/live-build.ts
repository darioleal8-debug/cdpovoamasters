/**
 * Conversão (pura, testável) das estatísticas registadas ao vivo no HoopHub
 * para o formato oficial da Liga INATEL (resultado, parciais, pontos por jogador).
 *
 * Em game_sessions/play_by_play o lado "home" é SEMPRE o CD Póvoa; na liga o
 * CD Póvoa pode jogar em casa ou fora — `ourSide` faz essa orientação.
 */

export type Side = "home" | "away";

export interface LivePlay {
  period: number;
  is_home_team: boolean;
  points_delta: number | null;
  player_id: string | null;
  deleted_at?: string | null;
}

export interface LivePlayerStat {
  player_id: string;
  pts: number;
  fg2_made: number; fg2_att: number;
  fg3_made: number; fg3_att: number;
  ft_made: number; ft_att: number;
  reb_off: number; reb_def: number;
  ast: number; stl: number; blk: number; tov: number;
  fouls_committed: number;
  efficiency: number | string | null;
  seconds_played?: number | null;
}

export interface LeaguePlayerRow {
  side: Side;
  numero: number | null;
  nome: string;
  pontos: number;
  dois_pontos: number;
  triplos: number;
  lances_livres: number;
  faltas: number;
  pontos_periodo: Record<number, number>;
  player_id: string;
  source: "manual";
}

export interface LiveLeagueResult {
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  /** parciais por período (orientados home/away da liga); null se inconsistentes */
  periods: { periodo: number; home_points: number; away_points: number }[] | null;
  players: LeaguePlayerRow[];
  unattributed: { home: number; away: number };
}

export function buildLiveLeagueResult(input: {
  ourSide: Side;
  ourScore: number;
  oppScore: number;
  plays: LivePlay[];
  stats: LivePlayerStat[];
  names: Map<string, { name: string; number: number | null }>;
}): LiveLeagueResult {
  const { ourSide, ourScore, oppScore } = input;
  const plays = input.plays.filter((p) => !p.deleted_at);
  const homeScore = ourSide === "home" ? ourScore : oppScore;
  const awayScore = ourSide === "home" ? oppScore : ourScore;

  // Parciais a partir das jogadas (pontos por período e equipa)
  const byPeriod = new Map<number, { us: number; opp: number }>();
  for (const p of plays) {
    const d = p.points_delta ?? 0;
    if (!d) continue;
    const row = byPeriod.get(p.period) ?? { us: 0, opp: 0 };
    if (p.is_home_team) row.us += d; else row.opp += d;
    byPeriod.set(p.period, row);
  }
  const maxPeriod = Math.max(4, ...plays.map((p) => p.period));
  const periodsRaw = Array.from({ length: maxPeriod }, (_, i) => {
    const r = byPeriod.get(i + 1) ?? { us: 0, opp: 0 };
    return {
      periodo: i + 1,
      home_points: ourSide === "home" ? r.us : r.opp,
      away_points: ourSide === "home" ? r.opp : r.us,
    };
  });
  const sumH = periodsRaw.reduce((s, p) => s + p.home_points, 0);
  const sumA = periodsRaw.reduce((s, p) => s + p.away_points, 0);
  const periods = sumH === homeScore && sumA === awayScore ? periodsRaw : null;

  // Pontos por período de cada jogador
  const playerPeriods = new Map<string, Record<number, number>>();
  for (const p of plays) {
    if (!p.is_home_team || !p.player_id || !p.points_delta) continue;
    const rec = playerPeriods.get(p.player_id) ?? {};
    rec[p.period] = (rec[p.period] ?? 0) + p.points_delta;
    playerPeriods.set(p.player_id, rec);
  }

  const players: LeaguePlayerRow[] = input.stats
    .filter((s) => input.names.has(s.player_id)) // ignora linhas sem jogador identificado
    .map((s) => {
      const n = input.names.get(s.player_id)!;
      return {
        side: ourSide,
        numero: n.number,
        nome: n.name,
        pontos: s.pts,
        dois_pontos: s.fg2_made,
        triplos: s.fg3_made,
        lances_livres: s.ft_made,
        faltas: s.fouls_committed,
        pontos_periodo: playerPeriods.get(s.player_id) ?? {},
        player_id: s.player_id,
        source: "manual" as const,
      };
    });

  const ourAttributed = players.reduce((s, p) => s + p.pontos, 0);
  const ourUnattributed = Math.max(0, ourScore - ourAttributed);
  return {
    homeScore,
    awayScore,
    overtime: maxPeriod > 4,
    periods,
    players,
    unattributed: ourSide === "home"
      ? { home: ourUnattributed, away: oppScore }
      : { home: oppScore, away: ourUnattributed },
  };
}

/** Lado do CD Póvoa num jogo da liga, a partir da meta do evento. */
export function resolveOurSide(
  meta: { is_home?: boolean; home_team?: string; away_team?: string } | null,
  ourTeamName: string
): Side {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const isOurs = (t?: string) => !!t && (norm(t).includes("povoa") || norm(t) === norm(ourTeamName));
  if (meta?.home_team && isOurs(meta.home_team)) return "home";
  if (meta?.away_team && isOurs(meta.away_team)) return "away";
  if (meta?.is_home === false) return "away";
  return "home";
}
