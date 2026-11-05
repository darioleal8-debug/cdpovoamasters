import type { PlayByPlay } from "@/types/database";

export interface DerivedPlayerStats {
  pts: number;
  fg2_made: number; fg2_att: number;
  fg3_made: number; fg3_att: number;
  ft_made: number; ft_att: number;
  reb_off: number; reb_def: number;
  ast: number; stl: number; blk: number; tov: number;
  fouls_def: number; fouls_of: number; fouls_tec: number; fouls_anti: number;
  fouls_total: number;
  fouls_drawn: number;
  /** tempo jogado (segundos) — preenchido por withSecondsPlayed */
  secs_played: number;
}

function empty(): DerivedPlayerStats {
  return {
    pts: 0, fg2_made: 0, fg2_att: 0, fg3_made: 0, fg3_att: 0,
    ft_made: 0, ft_att: 0, reb_off: 0, reb_def: 0,
    ast: 0, stl: 0, blk: 0, tov: 0,
    fouls_def: 0, fouls_of: 0, fouls_tec: 0, fouls_anti: 0, fouls_total: 0, fouls_drawn: 0, secs_played: 0,
  };
}

export interface DeriveResult {
  playerMap: Map<string, DerivedPlayerStats>;
  homeFouls: number;  // current period, excludes tec
  awayFouls: number;  // current period, excludes tec
  awayRebOff: number;
  awayRebDef: number;
  awayPts: number;
}

export function deriveStats(plays: PlayByPlay[], currentPeriod: number): DeriveResult {
  const playerMap = new Map<string, DerivedPlayerStats>();
  let homeFouls = 0;
  let awayFouls = 0;
  let awayRebOff = 0;
  let awayRebDef = 0;
  let awayPts = 0;

  for (const play of plays) {
    // Jogadas anuladas (soft-delete) não contam (STA-16)
    if ((play as { deleted_at?: string | null }).deleted_at) continue;
    const pid = play.player_id as string | null;

    if (play.is_home_team) {
      if (pid) {
        if (!playerMap.has(pid)) playerMap.set(pid, empty());
        const s = playerMap.get(pid)!;
        switch (play.event_type) {
          case "2pt_made":      s.pts += 2; s.fg2_made++; s.fg2_att++; break;
          case "2pt_miss":      s.fg2_att++; break;
          case "3pt_made":      s.pts += 3; s.fg3_made++; s.fg3_att++; break;
          case "3pt_miss":      s.fg3_att++; break;
          case "ft_made":       s.pts += 1; s.ft_made++; s.ft_att++; break;
          case "ft_miss":       s.ft_att++; break;
          case "rebound_off":   s.reb_off++; break;
          case "rebound_def":   s.reb_def++; break;
          case "assist":        s.ast++; break;
          case "steal":         s.stl++; break;
          case "block":         s.blk++; break;
          case "turnover":      s.tov++; break;
          case "foul_def":      s.fouls_def++; s.fouls_total++; break;
          case "foul_of":       s.fouls_of++;  s.fouls_total++; break;
          case "foul_tec":      s.fouls_tec++; s.fouls_total++; break;
          case "foul_anti":     s.fouls_anti++; s.fouls_total++; break;
          case "foul_committed":s.fouls_total++; break; // legacy event type
          case "foul_drawn":    s.fouls_drawn++; break;  // falta sofrida (não conta como cometida)
        }
        // Assistência registada no próprio cesto (secondary_player_id), tal como recordPlay grava (STA-16)
        const assistId = (play as { secondary_player_id?: string | null }).secondary_player_id;
        if (assistId && play.event_type.endsWith("_made")) {
          if (!playerMap.has(assistId)) playerMap.set(assistId, empty());
          playerMap.get(assistId)!.ast++;
        }
      }
      // Home team fouls for current period (tec does NOT count for team fouls)
      if (play.period === currentPeriod && pid) {
        if (["foul_def", "foul_of", "foul_anti", "foul_committed"].includes(play.event_type)) {
          homeFouls++;
        }
      }
    } else {
      // Away team
      awayPts += play.points_delta ?? 0;
      if (play.event_type === "rebound_off") awayRebOff++;
      if (play.event_type === "rebound_def") awayRebDef++;
      // Away team fouls for current period (tec does NOT count)
      if (play.period === currentPeriod) {
        if (["foul_def", "foul_of", "foul_anti"].includes(play.event_type)) {
          awayFouls++;
        }
      }
    }
  }

  return { playerMap, homeFouls, awayFouls, awayRebOff, awayRebDef, awayPts };
}

/** Junta o tempo jogado (segundos por jogador) ao mapa de estatísticas. */
export function withSecondsPlayed(
  playerMap: Map<string, DerivedPlayerStats>,
  secsById: Map<string, number>
): Map<string, DerivedPlayerStats> {
  const out = new Map<string, DerivedPlayerStats>();
  for (const [pid, s] of playerMap) out.set(pid, { ...s, secs_played: secsById.get(pid) ?? 0 });
  for (const [pid, secs] of secsById) if (!out.has(pid)) out.set(pid, { ...empty(), secs_played: secs });
  return out;
}

/** Eficiência (mesma fórmula da BD, recalc_player_efficiency):
 *  PTS + RES + AST + ROU + BLO − PER − lançamentos de campo falhados − LL falhados */
export function efficiency(s: DerivedPlayerStats | undefined | null): number {
  if (!s) return 0;
  return s.pts + s.reb_off + s.reb_def + s.ast + s.stl + s.blk - s.tov
    - ((s.fg2_att - s.fg2_made) + (s.fg3_att - s.fg3_made))
    - (s.ft_att - s.ft_made);
}

/** Faltas do adversário no jogo todo (exclui técnicas, como nas faltas de equipa). */
export function totalAwayFouls(plays: { is_home_team: boolean; event_type: string; deleted_at?: string | null }[]): number {
  return plays.filter((p) => !p.deleted_at && !p.is_home_team &&
    ["foul_def", "foul_of", "foul_anti", "foul_tec"].includes(p.event_type)).length;
}
