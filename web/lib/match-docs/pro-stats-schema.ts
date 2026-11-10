/**
 * Estatísticas profissionais (Tipo B): folhas exportadas por aplicações como Pocket Stat,
 * Basketball Stats Assistant, etc.
 *
 * Dois níveis, como no boletim oficial:
 *  - AiProStatsSchema: o que o modelo devolve. Parse tolerante, aceita colunas diferentes por
 *    aplicação, nunca inventa: o que não vem fica `null` ("não disponível"), NUNCA 0.
 *  - ProStatsData: representação canónica guardada em game_sheet_imports.stats_data.
 */
import { z } from "zod";
import { teamNameScore } from "@/lib/game-sheet/schema";

export const PRO_STATS_SCHEMA_VERSION = 1;
export const PRO_PROCESSING_VERSION = "pro-stats/1.0";

/** Estatísticas suportadas (todas opcionais). */
export const STAT_KEYS = [
  "secs", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta",
  "oreb", "dreb", "reb", "ast", "stl", "tov", "blk", "pf", "fd", "pm", "eff",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatLine = Record<StatKey, number | null>;

export const STAT_LABELS: Record<StatKey, string> = {
  secs: "Minutos", pts: "Pontos", fg2m: "2P conv.", fg2a: "2P tent.", fg3m: "3P conv.", fg3a: "3P tent.",
  ftm: "LL conv.", fta: "LL tent.", oreb: "Ress. ofensivos", dreb: "Ress. defensivos", reb: "Ressaltos",
  ast: "Assistências", stl: "Roubos", tov: "Perdas de bola", blk: "Desarmes", pf: "Faltas", fd: "Faltas sofridas",
  pm: "+/-", eff: "Eficiência",
};

export function emptyStatLine(): StatLine {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, null])) as StatLine;
}

export type Side = "home" | "away";

// ── Coerção tolerante ─────────────────────────────────────────────────────────

/** Inteiro ou null. "-", "", "—", "DNP" → null. Aceita "12", 12.0, "+5", "-3". */
export function toInt(v: unknown, { allowNegative = false } = {}): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (v < 0 && !allowNegative) return null;
    return Math.round(v);
  }
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/^\+/, "").replace(",", ".");
  if (!t || /^[-–—]$/.test(t) || /^(dnp|nj|n\/a|na)$/i.test(t)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (n < 0 && !allowNegative) return null;
  return Math.round(n);
}

/** "14:29" → 869 s; "15" → 900 s; 869 (número já em segundos se > 60 e sem ":"?) → minutos. */
export function toSeconds(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 60) : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = toInt(t);
  return n === null ? null : n * 60;
}

/** "10/25", "10-25", "10/25 (40%)" → [10, 25]. */
export function toMadeAtt(v: unknown): [number | null, number | null] {
  if (v === null || v === undefined) return [null, null];
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return [toInt(o.made ?? o.m ?? o.c), toInt(o.att ?? o.a ?? o.t)];
  }
  if (typeof v !== "string") return [null, null];
  const m = /^\s*(\d{1,3})\s*[/\-–]\s*(\d{1,3})/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}

const anyObj = z.preprocess((v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}), z.record(z.unknown()));
const anyArr = z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 40) : []), z.array(z.unknown()));
const str = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : typeof v === "number" ? String(v) : null), z.string().nullable());
const conf = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}, z.number().nullable());
const strList = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()).map((s: string) => s.trim().slice(0, 300)).slice(0, 40) : []),
  z.array(z.string()),
);

/** Linha de jogador/totais tal como o modelo a devolve (colunas livres). */
export const AiRowSchema = z.object({
  number: z.unknown().optional(),
  name: str.optional(),
  isTeamRow: z.unknown().optional(),
  stats: anyObj.optional(),
  illegible: strList.optional(),
  confidence: conf.optional(),
}).passthrough();

const sideField = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t === "home" || t === "casa" ? "home" : t === "away" || t === "fora" ? "away" : null;
}, z.enum(["home", "away"]).nullable());

export const AiProTeamSchema = z.object({
  name: str,
  side: sideField.optional(),
  players: anyArr,
  totals: anyObj.optional(),
  confidence: conf.optional(),
}).passthrough();

export const AiProStatsSchema = z.object({
  app: str.optional(),
  date: str.optional(),
  teams: anyArr,
  periodScores: anyArr.optional(),
  finalScore: anyObj.optional(),
  confidence: conf.optional(),
  warnings: strList.optional(),
  columnsFound: strList.optional(),
}).passthrough();
export type AiProStats = z.infer<typeof AiProStatsSchema>;

// ── Canónico ─────────────────────────────────────────────────────────────────

const statLineSchema = z.object(
  Object.fromEntries(STAT_KEYS.map((k) => [k, z.number().int().min(k === "pm" || k === "eff" ? -999 : 0).max(k === "secs" ? 6000 : 999).nullable()])) as Record<StatKey, z.ZodNullable<z.ZodNumber>>,
);

export const ProPlayerSchema = z.object({
  id: z.string().min(1).max(40),
  number: z.number().int().min(0).max(99).nullable(),
  name: z.string().max(200),
  stats: statLineSchema,
  extra: z.record(z.union([z.string().max(60), z.number()])).default({}),
  illegible: z.array(z.string().max(20)).max(30).default([]),
  derived: z.array(z.string().max(20)).max(30).default([]),
  confidence: z.number().min(0).max(1).nullable(),
  hoophubPlayerId: z.string().uuid().nullable().default(null),
  inDatabase: z.boolean().nullable().default(null),
});
export type ProPlayer = z.infer<typeof ProPlayerSchema>;

export const ProTeamSchema = z.object({
  side: z.enum(["home", "away"]).nullable(),
  sheetName: z.string().max(200).nullable(),
  /** Só existe linha agregada de equipa (ex.: Pocket Stat "Equipa (sem jogador)") */
  teamOnly: z.boolean(),
  players: z.array(ProPlayerSchema).max(30),
  totals: statLineSchema,
  confidence: z.number().min(0).max(1).nullable(),
});
export type ProTeam = z.infer<typeof ProTeamSchema>;

export const ProStatsDataSchema = z.object({
  schemaVersion: z.literal(PRO_STATS_SCHEMA_VERSION),
  app: z.string().max(100).nullable(),
  date: z.string().max(60).nullable(),
  teams: z.object({ home: ProTeamSchema.nullable(), away: ProTeamSchema.nullable() }),
  /** Equipas lidas que não se conseguiram associar ao jogo */
  unmatchedTeams: z.array(z.string().max(200)).max(4).default([]),
  periods: z.array(z.object({ period: z.number().int().min(1).max(10), home: z.number().int().min(0).max(300).nullable(), away: z.number().int().min(0).max(300).nullable() })).max(10),
  final: z.object({ home: z.number().int().min(0).max(300).nullable(), away: z.number().int().min(0).max(300).nullable() }),
  aiConfidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string().max(300)).max(60),
  columnsFound: z.array(z.string().max(40)).max(60).default([]),
});
export type ProStatsData = z.infer<typeof ProStatsDataSchema>;

// ── Normalização AI → canónico ───────────────────────────────────────────────

/** Sinónimos das colunas das várias aplicações (PT / EN / FIBA). */
const ALIASES: Record<string, StatKey | "fg" | "2p" | "3p" | "ft" | "min"> = {
  min: "min", mins: "min", minutes: "min", minutos: "min", tempo: "min",
  pts: "pts", pontos: "pts", points: "pts", p: "pts",
  fg: "fg", fgma: "fg", "fgm-a": "fg", lc: "fg", lancamentos: "fg",
  "2p": "2p", "2pt": "2p", "2pma": "2p", "2pm-a": "2p", "2pc/a": "2p", "2pca": "2p",
  "3p": "3p", "3pt": "3p", "3pma": "3p", "3pm-a": "3p", "3pc/a": "3p", "3pca": "3p",
  ft: "ft", ll: "ft", ftma: "ft", "ftm-a": "ft", "llc/a": "ft", llca: "ft",
  fg2m: "fg2m", fg2a: "fg2a", fg3m: "fg3m", fg3a: "fg3a", ftm: "ftm", fta: "fta",
  "2pm": "fg2m", "2pa": "fg2a", "3pm": "fg3m", "3pa": "fg3a",
  ro: "oreb", oreb: "oreb", reboff: "oreb", orb: "oreb", "reb off": "oreb", rebof: "oreb",
  rd: "dreb", dreb: "dreb", rebdef: "dreb", drb: "dreb", "reb def": "dreb",
  res: "reb", reb: "reb", rt: "reb", ressaltos: "reb", rebounds: "reb", tr: "reb",
  ass: "ast", ast: "ast", assists: "ast", assistencias: "ast", as: "ast",
  rou: "stl", st: "stl", stl: "stl", steals: "stl", roubos: "stl", br: "stl",
  to: "tov", tov: "tov", turnovers: "tov", perdas: "tov", per: "tov", bp: "tov",
  blo: "blk", bs: "blk", blk: "blk", blocks: "blk", desarmes: "blk", dl: "blk",
  fc: "pf", pf: "pf", fal: "pf", faltas: "pf", fouls: "pf", f: "pf",
  fs: "fd", fd: "fd", pfd: "fd", fpf: "fd", "faltas sofridas": "fd",
  "+/-": "pm", pm: "pm", plusminus: "pm", "plus/minus": "pm",
  ef: "eff", eff: "eff", efficiency: "eff", val: "eff", pir: "eff",
};

function canonKey(k: string): string {
  return k.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

function resolveKey(k: string): StatKey | "fg" | "2p" | "3p" | "ft" | "min" | null {
  const c = canonKey(k);
  return ALIASES[c] ?? ALIASES[c.replace(/[\s_.]/g, "")] ?? null;
}

const TEAM_ROW_RE = /^(equipa|team|totais?|totals?|sem jogador|outros|others)\b|\(sem jogador\)|team\s*\(/i;

/** Converte as colunas livres de uma linha numa StatLine (+ extras e valores derivados). */
export function rowToStatLine(stats: Record<string, unknown>): { line: StatLine; extra: Record<string, string | number>; derived: StatKey[] } {
  const line = emptyStatLine();
  const extra: Record<string, string | number> = {};
  let fg: [number | null, number | null] = [null, null];
  for (const [rawKey, value] of Object.entries(stats)) {
    const key = resolveKey(rawKey);
    if (key === null) {
      if ((typeof value === "string" && value.trim()) || typeof value === "number") {
        extra[rawKey.slice(0, 30)] = typeof value === "string" ? value.slice(0, 60) : value;
      }
      continue;
    }
    if (key === "min") { line.secs = toSeconds(value); continue; }
    if (key === "fg") { fg = toMadeAtt(value); continue; }
    if (key === "2p") { [line.fg2m, line.fg2a] = toMadeAtt(value); continue; }
    if (key === "3p") { [line.fg3m, line.fg3a] = toMadeAtt(value); continue; }
    if (key === "ft") { [line.ftm, line.fta] = toMadeAtt(value); continue; }
    if (key === "secs") { line.secs = toInt(value); continue; }
    line[key] = toInt(value, { allowNegative: key === "pm" || key === "eff" });
  }
  const derived: StatKey[] = [];
  // FGM-A + 3PM-A sem coluna de 2P → 2P = FG − 3P (calculado por código, marcado como derivado)
  if (line.fg2m === null && fg[0] !== null && line.fg3m !== null && fg[0] >= line.fg3m) { line.fg2m = fg[0] - line.fg3m; derived.push("fg2m"); }
  if (line.fg2a === null && fg[1] !== null && line.fg3a !== null && fg[1] >= line.fg3a) { line.fg2a = fg[1] - line.fg3a; derived.push("fg2a"); }
  if (line.reb === null && line.oreb !== null && line.dreb !== null) { line.reb = line.oreb + line.dreb; derived.push("reb"); }
  if (line.pts === null && line.fg2m !== null && line.fg3m !== null && line.ftm !== null) {
    line.pts = 2 * line.fg2m + 3 * line.fg3m + line.ftm; derived.push("pts");
  }
  return { line, extra, derived };
}

function parseNumberAndName(row: { number?: unknown; name?: string | null }): { number: number | null; name: string } {
  let number = toInt(row.number);
  let name = (row.name ?? "").trim();
  // "#4 Afonso", "4 - Afonso"
  const m = /^#?\s*(\d{1,2})\s*[-–.]?\s+(.+)$/.exec(name);
  if (m && number === null) { number = Number(m[1]); name = m[2].trim(); }
  else if (m && number === Number(m[1])) name = m[2].trim();
  return { number: number !== null && number <= 99 ? number : null, name: name.slice(0, 200) };
}

/**
 * Associa as equipas lidas às equipas do jogo. Ordem: nome; depois a equipa que submeteu
 * (a equipa com estatística individual completa é normalmente a de quem submete).
 */
export function assignSides(
  names: (string | null)[],
  game: { home: string; away: string },
): (Side | null)[] {
  const out: (Side | null)[] = names.map(() => null);
  const scores = names.map((n) => ({ h: teamNameScore(n, game.home), a: teamNameScore(n, game.away) }));
  // Melhor combinação para as 2 primeiras equipas com nome
  if (names.length >= 2) {
    const straight = scores[0].h + scores[1].a;
    const swapped = scores[0].a + scores[1].h;
    if (Math.max(straight, swapped) >= 0.5) {
      [out[0], out[1]] = straight >= swapped ? ["home", "away"] : ["away", "home"];
      return out;
    }
  }
  scores.forEach((s, i) => {
    if (Math.max(s.h, s.a) >= 0.5) out[i] = s.h >= s.a ? "home" : "away";
  });
  return out;
}

export function aiToProStats(ai: AiProStats, game: { home: string; away: string }): ProStatsData {
  const rawTeams = ai.teams.flatMap((t) => {
    const r = AiProTeamSchema.safeParse(t);
    return r.success ? [r.data] : [];
  }).slice(0, 4);
  const byName = assignSides(rawTeams.map((t) => t.name), game);
  // Lado indicado pelo modelo (ex.: tabela sem nome de equipa, identificada pelo total de pontos)
  // só é usado quando o nome não aponta claramente para o outro lado.
  const sides: (Side | null)[] = rawTeams.map((t, i) => {
    const named = byName[i];
    const strong = named && teamNameScore(t.name, named === "home" ? game.home : game.away) >= 0.5;
    return strong ? named : (t.side ?? named);
  });
  if (sides.length === 2 && sides[0] && sides[0] === sides[1]) sides[1] = sides[0] === "home" ? "away" : "home";
  const teams: { home: ProTeam | null; away: ProTeam | null } = { home: null, away: null };
  const unmatched: string[] = [];
  const warnings = [...(ai.warnings ?? [])];
  let pid = 0;

  rawTeams.forEach((t, ti) => {
    const side = sides[ti];
    const players: ProPlayer[] = [];
    let teamRowLine: StatLine | null = null;
    let totals = emptyStatLine();
    const totalsIn = t.totals && Object.keys(t.totals).length ? rowToStatLine(t.totals).line : null;

    for (const raw of t.players) {
      const r = AiRowSchema.safeParse(raw);
      if (!r.success) continue;
      const { number, name } = parseNumberAndName(r.data);
      const { line, extra, derived } = rowToStatLine(r.data.stats ?? {});
      const isTeamRow = r.data.isTeamRow === true || TEAM_ROW_RE.test(name);
      if (/^totais?$|^totals?$/i.test(name)) { if (!totalsIn) totals = line; continue; }
      if (isTeamRow) { teamRowLine = line; continue; }
      if (!name && number === null) continue;
      players.push({
        id: `pp${++pid}`, number, name: name || `N.º ${number}`, stats: line, extra,
        illegible: (r.data.illegible ?? []).map((k) => (resolveKey(k) as string) ?? k).slice(0, 30),
        derived, confidence: r.data.confidence ?? null, hoophubPlayerId: null, inDatabase: null,
      });
    }
    if (totalsIn) totals = totalsIn;
    const teamOnly = players.length === 0 && teamRowLine !== null;
    if (teamOnly && STAT_KEYS.every((k) => totals[k] === null)) totals = teamRowLine!;
    if (!teamOnly && teamRowLine) warnings.push(`${t.name ?? "Equipa"}: linha de equipa sem jogador ignorada nas estatísticas individuais.`);

    const team: ProTeam = { side, sheetName: t.name, teamOnly, players, totals, confidence: t.confidence ?? null };
    if (side && !teams[side]) teams[side] = team;
    else unmatched.push(t.name ?? `Equipa ${ti + 1}`);
  });
  if (unmatched.length) warnings.push(`Equipa(s) não associada(s) ao jogo: ${unmatched.join(", ")}.`);

  // Parciais: aceitamos {period, A/B} ou {period, home/away} ou {period, <nome equipa>}
  const periods: ProStatsData["periods"] = [];
  for (const p of ai.periodScores ?? []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const period = toInt(o.period ?? o.periodo ?? o.q);
    if (period === null || period < 1 || period > 10) continue;
    const nameKey = (side: Side) => {
      const idx = sides.indexOf(side);
      const nm = idx >= 0 ? rawTeams[idx].name : null;
      return nm && o[nm] !== undefined ? o[nm] : undefined;
    };
    const home = toInt(o.home ?? nameKey("home") ?? (sides[0] === "home" ? o.A : sides[1] === "home" ? o.B : undefined));
    const away = toInt(o.away ?? nameKey("away") ?? (sides[0] === "away" ? o.A : sides[1] === "away" ? o.B : undefined));
    if (!periods.some((x) => x.period === period)) periods.push({ period, home: home !== null && home <= 300 ? home : null, away: away !== null && away <= 300 ? away : null });
  }
  periods.sort((a, b) => a.period - b.period);

  const fs = ai.finalScore ?? {};
  const pickFinal = (side: Side): number | null => {
    const idx = sides.indexOf(side);
    const nm = idx >= 0 ? rawTeams[idx].name : null;
    const v = toInt(fs[side] ?? (nm ? fs[nm] : undefined) ?? (idx === 0 ? fs.A : idx === 1 ? fs.B : undefined));
    return v !== null && v <= 300 ? v : null;
  };

  return {
    schemaVersion: PRO_STATS_SCHEMA_VERSION,
    app: ai.app ?? null,
    date: ai.date ?? null,
    teams,
    unmatchedTeams: unmatched.slice(0, 4),
    periods,
    final: { home: pickFinal("home"), away: pickFinal("away") },
    aiConfidence: ai.confidence ?? null,
    warnings: warnings.slice(0, 60),
    columnsFound: (ai.columnsFound ?? []).slice(0, 60),
  };
}

/** Total da equipa para uma estatística: linha de totais, senão soma dos jogadores (se todos a têm). */
export function teamStat(team: ProTeam, key: StatKey): number | null {
  if (team.totals[key] !== null) return team.totals[key];
  if (team.teamOnly || team.players.length === 0) return null;
  if (team.players.some((p) => p.stats[key] === null)) return null;
  return team.players.reduce((s, p) => s + (p.stats[key] ?? 0), 0);
}

/** Resultado final segundo o documento: placar explícito, senão total de pontos de cada equipa. */
export function proFinal(data: ProStatsData): { home: number | null; away: number | null } {
  return {
    home: data.final.home ?? (data.teams.home ? teamStat(data.teams.home, "pts") : null),
    away: data.final.away ?? (data.teams.away ? teamStat(data.teams.away, "pts") : null),
  };
}
