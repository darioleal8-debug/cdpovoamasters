/**
 * Terminologia oficial das estatísticas em TODA a app (gestão, live, relatórios, PDF, Liga, IA).
 * Segue a NBA, sempre em inglês: não traduzir nem inventar siglas novas — importar daqui.
 */

export const NBA_STATS = {
  gp:   { abbr: "GP",     name: "Games played" },
  min:  { abbr: "MIN",    name: "Minutes" },
  pts:  { abbr: "PTS",    name: "Points" },
  fg2m: { abbr: "2PM",    name: "2-point field goals made" },
  fg2a: { abbr: "2PA",    name: "2-point field goals attempted" },
  fg2p: { abbr: "2P%",    name: "2-point field goal percentage" },
  fg3m: { abbr: "3PM",    name: "3-point field goals made" },
  fg3a: { abbr: "3PA",    name: "3-point field goals attempted" },
  fg3p: { abbr: "3P%",    name: "3-point field goal percentage" },
  fgp:  { abbr: "FG%",    name: "Field goal percentage" },
  ftm:  { abbr: "FTM",    name: "Free throws made" },
  fta:  { abbr: "FTA",    name: "Free throws attempted" },
  ftp:  { abbr: "FT%",    name: "Free throw percentage" },
  oreb: { abbr: "OREB",   name: "Offensive rebounds" },
  dreb: { abbr: "DREB",   name: "Defensive rebounds" },
  reb:  { abbr: "REB",    name: "Rebounds" },
  ast:  { abbr: "AST",    name: "Assists" },
  stl:  { abbr: "STL",    name: "Steals" },
  blk:  { abbr: "BLK",    name: "Blocks" },
  blka: { abbr: "BLKA",   name: "Blocks against (shots blocked)" },
  tov:  { abbr: "TOV",    name: "Turnovers" },
  pf:   { abbr: "PF",     name: "Personal fouls" },
  pfd:  { abbr: "PFD",    name: "Personal fouls drawn" },
  eff:  { abbr: "EFF",    name: "Efficiency" },
  pm:   { abbr: "+/-",    name: "Plus/minus" },
  ppg:  { abbr: "PPG",    name: "Points per game" },
  rpg:  { abbr: "RPG",    name: "Rebounds per game" },
  apg:  { abbr: "APG",    name: "Assists per game" },
} as const;

export type NbaStatKey = keyof typeof NBA_STATS;

export const abbr = (k: NbaStatKey): string => NBA_STATS[k].abbr;
export const statName = (k: NbaStatKey): string => NBA_STATS[k].name;

/** "M/A" = made/attempted (ex.: cabeçalho "2P M/A", célula "3/5"). */
export const MADE_ATTEMPTED = "M/A";

/** Períodos NBA: Q1–Q4, OT, 2OT, 3OT… (nunca 1º/2º/P1/PROL.). */
export const periodLabel = (p: number): string => (p <= 4 ? `Q${p}` : p === 5 ? "OT" : `${p - 4}OT`);

/** Classificação (standings) — NBA: Team, GP, W, L (+ T empates), PF/PA, DIFF, PTS (pontos na tabela). */
export const STANDINGS = {
  team: "Team", gp: "GP", w: "W", t: "T", l: "L", pf: "PF", pa: "PA", diff: "DIFF", pts: "PTS", last5: "L5", home: "Home", away: "Away",
} as const;

/** Frase para prompts de IA: texto em português, mas termos de estatística sempre NBA em inglês. */
export const AI_TERMINOLOGY_RULE =
  "Terminologia de estatísticas: usa SEMPRE os termos da NBA em inglês, mesmo em texto português — points (PTS), rebounds (REB), " +
  "offensive/defensive rebounds (OREB/DREB), assists (AST), steals (STL), blocks (BLK), turnovers (TOV), personal fouls (PF), " +
  "free throws (FT), 3-pointers (3PM/3PA), field goal percentage (FG%), efficiency (EFF), plus/minus (+/-). " +
  "Nunca uses 'ressaltos', 'assistências', 'roubos', 'desarmes', 'perdas de bola', 'lances livres' ou 'triplos' como nome de estatística.";
