/**
 * Esquema versionado do boletim de jogo (folha oficial INATEL / modelo FIBA).
 *
 * Dois níveis:
 *  - AiSheetSchema: o que o modelo de visão devolve. É SEMPRE dado não fiável — o parse é
 *    tolerante (coage tipos, descarta lixo) mas nunca promove uma leitura incerta a confirmada.
 *  - SheetData: a representação canónica guardada em game_sheet_imports.sheet_data e editada
 *    pelo utilizador na revisão. É sobre ela que o motor (engine.ts) calcula tudo.
 */
import { z } from "zod";

export const SHEET_SCHEMA_VERSION = 1;
export const PROCESSING_VERSION = "boletim-ia/1.0";

export type Side = "home" | "away";
export type ShotType = "FT" | "2PT" | "3PT";

export const IMPORT_STATUSES = [
  "processing",
  "needs_review",
  "ready_to_confirm",
  "confirmed",
  "published",
  "failed",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

// ── Helpers de coerção tolerante ───────────────────────────────────────────────

/** Número inteiro ≥ 0 ou null (aceita "12", 12.0; rejeita NaN, negativos, texto). */
const intOrNull = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}, z.number().int().nullable());

const confidence = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  // aceita 0–1 ou 0–100
  const c = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, c));
}, z.number().nullable());

const strOrNull = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 200) : null;
}, z.string().nullable());

const teamLetter = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  if (t === "A" || t === "CASA" || t === "HOME") return "A";
  if (t === "B" || t === "FORA" || t === "AWAY") return "B";
  return null;
}, z.enum(["A", "B"]).nullable());

const shotType = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase().replace(/\s+/g, "");
  if (["FT", "LL", "1", "1PT", "LANCELIVRE"].includes(t)) return "FT";
  if (["2PT", "2", "2P"].includes(t)) return "2PT";
  if (["3PT", "3", "3P", "TRIPLO"].includes(t)) return "3PT";
  return null;
}, z.enum(["FT", "2PT", "3PT"]).nullable());

const shotPoints = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return n === 1 || n === 2 || n === 3 ? n : null;
}, z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable());

const region = z.preprocess((v) => {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const nums = ["x", "y", "w", "h"].map((k) => Number(r[k]));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  // normalizado 0–1; aceita 0–100 (percentagem)
  const scale = nums.some((n) => n > 1) ? 100 : 1;
  const [x, y, w, h] = nums.map((n) => Math.max(0, Math.min(1, n / scale)));
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}, z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable());

const arr = <T extends z.ZodTypeAny>(item: T, max = 400) =>
  z.preprocess((v) => (Array.isArray(v) ? v.slice(0, max) : []), z.array(z.unknown()))
    .transform((items) =>
      items.flatMap((i) => {
        const r = item.safeParse(i);
        return r.success ? [r.data as z.infer<T>] : [];
      }),
    );

const stringList = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()).map((s: string) => s.trim().slice(0, 300)).slice(0, 50) : []),
  z.array(z.string()),
);

// ── Esquema da resposta do modelo (v1) ─────────────────────────────────────────

export const AiPlayerSchema = z.object({
  team: teamLetter,
  number: intOrNull,
  name: strOrNull,
  fouls: intOrNull,
  played: z.preprocess((v) => (typeof v === "boolean" ? v : null), z.boolean().nullable()),
  confidence,
});

export const AiScoringEventSchema = z.object({
  team: teamLetter,
  seq: intOrNull,
  period: intOrNull,
  cumulativeScore: intOrNull,
  points: shotPoints,
  shotType,
  playerNumber: intOrNull,
  confidence,
  note: strOrNull,
  region,
});

export const AiSheetSchema = z.object({
  schemaVersion: z.preprocess((v) => (v == null ? SHEET_SCHEMA_VERSION : Number(v)), z.number()),
  layout: strOrNull,
  game: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({
    competition: strOrNull,
    phase: strOrNull,
    season: strOrNull,
    gameNumber: strOrNull,
    date: strOrNull,
    time: strOrNull,
    venue: strOrNull,
  })),
  teams: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({
    A: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({ name: strOrNull })),
    B: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({ name: strOrNull })),
  })),
  players: arr(AiPlayerSchema, 40),
  scoringEvents: arr(AiScoringEventSchema, 300),
  periodScores: arr(z.object({ period: intOrNull, A: intOrNull, B: intOrNull }), 10),
  finalScore: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({ A: intOrNull, B: intOrNull })),
  teamFouls: arr(z.object({ team: teamLetter, period: intOrNull, count: intOrNull }), 20),
  timeouts: arr(z.object({ team: teamLetter, count: intOrNull }), 4),
  officials: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({
    referees: stringList,
    scorer: strOrNull,
    timekeeper: strOrNull,
  })),
  confidence,
  warnings: stringList,
  validation: z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object({
    notes: stringList,
  }).passthrough()),
});
export type AiSheet = z.infer<typeof AiSheetSchema>;

/** Resposta da segunda leitura (regiões duvidosas). */
export const AiRecheckSchema = z.object({
  events: arr(z.object({
    id: z.string(),
    cumulativeScore: intOrNull,
    points: shotPoints,
    shotType,
    playerNumber: intOrNull,
    confidence,
    note: strOrNull,
  }), 60),
});
export type AiRecheck = z.infer<typeof AiRecheckSchema>;

// ── Representação canónica (editável) ─────────────────────────────────────────

export const SheetPlayerSchema = z.object({
  id: z.string().min(1).max(40),
  side: z.enum(["home", "away"]),
  number: z.number().int().min(0).max(99).nullable(),
  name: z.string().max(200),
  hoophubPlayerId: z.string().uuid().nullable().default(null),
  fouls: z.number().int().min(0).max(10).nullable(),
  played: z.boolean().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});
export type SheetPlayer = z.infer<typeof SheetPlayerSchema>;

export const SheetEventSchema = z.object({
  id: z.string().min(1).max(40),
  side: z.enum(["home", "away"]),
  seq: z.number().int().min(0).max(1000),
  period: z.number().int().min(1).max(10).nullable(),
  cumulative: z.number().int().min(0).max(300).nullable(),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  shotType: z.enum(["FT", "2PT", "3PT"]).nullable(),
  playerNumber: z.number().int().min(0).max(99).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  note: z.string().max(300).nullable(),
  region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  /** O utilizador reviu/corrigiu este evento manualmente */
  userVerified: z.boolean().default(false),
  /** Marcado pelo utilizador como anulado / correção do marcador (excluído da marcha) */
  voided: z.boolean().default(false),
});
export type SheetEvent = z.infer<typeof SheetEventSchema>;

const nullableScore = z.number().int().min(0).max(300).nullable();

export const SheetDataSchema = z.object({
  schemaVersion: z.literal(SHEET_SCHEMA_VERSION),
  layout: z.string().max(60),
  game: z.object({
    competition: z.string().max(200).nullable(),
    phase: z.string().max(200).nullable(),
    season: z.string().max(200).nullable(),
    gameNumber: z.string().max(200).nullable(),
    date: z.string().max(200).nullable(),
    time: z.string().max(200).nullable(),
    venue: z.string().max(200).nullable(),
  }),
  teams: z.object({
    home: z.object({ name: z.string().max(200), sheetName: z.string().max(200).nullable() }),
    away: z.object({ name: z.string().max(200), sheetName: z.string().max(200).nullable() }),
  }),
  /** true quando a "Equipa A" da folha é a equipa da casa do jogo HoopHub */
  sheetTeamAIsHome: z.boolean(),
  players: z.array(SheetPlayerSchema).max(40),
  events: z.array(SheetEventSchema).max(300),
  periods: z.array(z.object({
    period: z.number().int().min(1).max(10),
    home: nullableScore,
    away: nullableScore,
  })).max(10),
  final: z.object({ home: nullableScore, away: nullableScore }),
  teamFouls: z.array(z.object({
    side: z.enum(["home", "away"]),
    period: z.number().int().min(1).max(10),
    count: z.number().int().min(0).max(30),
  })).max(20),
  timeouts: z.array(z.object({
    side: z.enum(["home", "away"]),
    count: z.number().int().min(0).max(10),
  })).max(4),
  officials: z.object({
    referees: z.array(z.string().max(200)).max(5),
    scorer: z.string().max(200).nullable(),
    timekeeper: z.string().max(200).nullable(),
  }),
  aiConfidence: z.number().min(0).max(1).nullable(),
  aiWarnings: z.array(z.string().max(300)).max(50),
});
export type SheetData = z.infer<typeof SheetDataSchema>;

// ── Conversão AI → canónico ───────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Semelhança simples entre nomes de equipa (tokens partilhados). */
export function teamNameScore(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(norm(a).split(" ").filter((t) => t.length > 1));
  const tb = new Set(norm(b).split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * Decide se a "Equipa A" da folha é a equipa da casa. Por omissão (FIBA) A = casa;
 * só inverte quando os nomes lidos apontam claramente para o contrário.
 */
export function inferTeamAIsHome(sheetA: string | null, sheetB: string | null, home: string, away: string): boolean {
  const straight = teamNameScore(sheetA, home) + teamNameScore(sheetB, away);
  const swapped = teamNameScore(sheetA, away) + teamNameScore(sheetB, home);
  return !(swapped > straight && swapped >= 0.5);
}

export function aiToSheetData(ai: AiSheet, game: { home: string; away: string }): SheetData {
  const aIsHome = inferTeamAIsHome(ai.teams.A.name, ai.teams.B.name, game.home, game.away);
  const sideOf = (t: "A" | "B" | null): Side | null =>
    t === null ? null : (t === "A") === aIsHome ? "home" : "away";
  const pick = <T,>(o: { A: T; B: T }, side: Side): T =>
    (side === "home") === aIsHome ? o.A : o.B;

  const players: SheetPlayer[] = ai.players.flatMap((p, i) => {
    const side = sideOf(p.team);
    if (!side) return [];
    return [{
      id: `p${i + 1}`,
      side,
      number: p.number !== null && p.number <= 99 ? p.number : null,
      name: p.name ?? "",
      hoophubPlayerId: null,
      fouls: p.fouls !== null && p.fouls <= 10 ? p.fouls : null,
      played: p.played,
      confidence: p.confidence,
    }];
  });

  const events: SheetEvent[] = ai.scoringEvents.flatMap((e, i) => {
    const side = sideOf(e.team);
    if (!side) return [];
    return [{
      id: `e${i + 1}`,
      side,
      seq: e.seq ?? i,
      period: e.period !== null && e.period >= 1 && e.period <= 10 ? e.period : null,
      cumulative: e.cumulativeScore !== null && e.cumulativeScore <= 300 ? e.cumulativeScore : null,
      points: e.points,
      shotType: e.shotType,
      playerNumber: e.playerNumber !== null && e.playerNumber <= 99 ? e.playerNumber : null,
      confidence: e.confidence,
      note: e.note,
      region: e.region,
      userVerified: false,
      voided: false,
    }];
  });

  const periods = ai.periodScores
    .filter((p) => p.period !== null && p.period >= 1 && p.period <= 10)
    .map((p) => ({ period: p.period!, home: pick(p, "home"), away: pick(p, "away") }))
    .sort((a, b) => a.period - b.period)
    .filter((p, i, list) => i === 0 || list[i - 1].period !== p.period);

  const clampScore = (n: number | null) => (n !== null && n <= 300 ? n : null);

  return {
    schemaVersion: SHEET_SCHEMA_VERSION,
    layout: ai.layout ?? "inatel-fiba",
    game: { ...ai.game },
    teams: {
      home: { name: game.home, sheetName: aIsHome ? ai.teams.A.name : ai.teams.B.name },
      away: { name: game.away, sheetName: aIsHome ? ai.teams.B.name : ai.teams.A.name },
    },
    sheetTeamAIsHome: aIsHome,
    players,
    events,
    periods: periods.map((p) => ({ ...p, home: clampScore(p.home), away: clampScore(p.away) })),
    final: { home: clampScore(pick(ai.finalScore, "home")), away: clampScore(pick(ai.finalScore, "away")) },
    teamFouls: ai.teamFouls.flatMap((f) => {
      const side = sideOf(f.team);
      return side && f.period && f.period <= 10 && f.count !== null && f.count <= 30
        ? [{ side, period: f.period, count: f.count }] : [];
    }),
    timeouts: ai.timeouts.flatMap((t) => {
      const side = sideOf(t.team);
      return side && t.count !== null && t.count <= 10 ? [{ side, count: t.count }] : [];
    }).slice(0, 2),
    officials: {
      referees: ai.officials.referees.slice(0, 5).map((r) => r.slice(0, 200)),
      scorer: ai.officials.scorer,
      timekeeper: ai.officials.timekeeper,
    },
    aiConfidence: ai.confidence,
    aiWarnings: [...ai.warnings, ...ai.validation.notes].slice(0, 50),
  };
}

/** SheetData vazio para preenchimento manual (quando a leitura falha). */
export function emptySheetData(game: { home: string; away: string }): SheetData {
  return {
    schemaVersion: SHEET_SCHEMA_VERSION,
    layout: "inatel-fiba",
    game: { competition: null, phase: null, season: null, gameNumber: null, date: null, time: null, venue: null },
    teams: { home: { name: game.home, sheetName: null }, away: { name: game.away, sheetName: null } },
    sheetTeamAIsHome: true,
    players: [],
    events: [],
    periods: [1, 2, 3, 4].map((period) => ({ period, home: null, away: null })),
    final: { home: null, away: null },
    teamFouls: [],
    timeouts: [],
    officials: { referees: [], scorer: null, timekeeper: null },
    aiConfidence: null,
    aiWarnings: [],
  };
}
