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
}

function empty(): DerivedPlayerStats {
  return {
    pts: 0, fg2_made: 0, fg2_att: 0, fg3_made: 0, fg3_att: 0,
    ft_made: 0, ft_att: 0, reb_off: 0, reb_def: 0,
    ast: 0, stl: 0, blk: 0, tov: 0,
    fouls_def: 0, fouls_of: 0, fouls_tec: 0, fouls_anti: 0, fouls_total: 0,
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
