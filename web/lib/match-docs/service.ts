/**
 * Orquestração da validação cruzada de um jogo (servidor).
 *
 * Usa o cliente de serviço SÓ depois de o chamador ter sido autorizado (delegado de uma das
 * equipas do jogo ou admin da liga): precisa de ler as submissões das DUAS equipas, que a RLS
 * esconde a cada delegado.
 */
import { createHash } from "node:crypto";
import { withAiAttribution } from "@/lib/ai-usage";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeName, parseGameMeta } from "@/types/competitions";
import { analyzeSheet } from "@/lib/game-sheet/engine";
import { SheetDataSchema } from "@/lib/game-sheet/schema";
import { ProStatsDataSchema } from "./pro-stats-schema";
import { validateProStats } from "./validate";
import { reconcile, type AiReview, type KnownPlayer, type OfficialInput, type ProInput, type ReconciliationResult, type Val } from "./reconcile";
import { crossCheckWithAI } from "./cross-check";
import { fullName, loadGameRosters, rosterPromptBlock } from "@/lib/liga/roster";

export type AdminDb = Awaited<ReturnType<typeof createAdminClient>>;
export type DocType = "official_sheet" | "pro_stats";

export interface MatchGame {
  id: string;
  date: string | null;
  home: string;
  away: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  isTest: boolean;
}

export interface MatchDocRow {
  id: string;
  event_id: string;
  team_id: string | null;
  doc_type: DocType;
  status: string;
  image_path: string | null;
  image_mime: string | null;
  image_sha256: string | null;
  sheet_data: unknown;
  stats_data: unknown;
  validation: unknown;
  error: string | null;
  page_count: number | null;
  analysis_count: number;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  submission_id: string | null;
}

export const MATCH_DOC_COLUMNS =
  "id, event_id, team_id, doc_type, status, image_path, image_mime, image_sha256, sheet_data, stats_data, validation, error, page_count, analysis_count, created_at, updated_at, confirmed_at, submission_id";

/** Estados de documento que contam como "submetido" pela equipa. */
const TEAM_COUNTED = new Set(["confirmed", "published"]);
/** Documentos do admin contam assim que têm leitura. */
const ADMIN_COUNTED = new Set(["needs_review", "ready_to_confirm", "confirmed", "published"]);

export async function loadMatchGame(db: AdminDb, eventId: string): Promise<MatchGame | null> {
  const { data: ev } = await db.from("events").select("id, event_date, description, is_test, deleted_at").eq("id", eventId).is("deleted_at", null).maybeSingle();
  if (!ev) return null;
  const meta = parseGameMeta(ev.description as string | null);
  if (!meta?.home_team || !meta.away_team) return null;
  const { data: teams } = await db.from("league_teams").select("id, name, normalized_name");
  const find = (n: string) => (teams ?? []).find((t) => (t.normalized_name ?? normalizeName(t.name as string)) === normalizeName(n))?.id as string | undefined;
  return {
    id: ev.id as string, date: (ev.event_date as string | null) ?? null, home: meta.home_team, away: meta.away_team,
    homeTeamId: find(meta.home_team) ?? null, awayTeamId: find(meta.away_team) ?? null,
    isTest: Boolean(ev.is_test) || meta.is_test === true,
  };
}

export function sideOfTeam(game: MatchGame, teamId: string | null): "home" | "away" | null {
  if (!teamId) return null;
  if (teamId === game.homeTeamId) return "home";
  if (teamId === game.awayTeamId) return "away";
  return null;
}

export async function loadMatchDocs(db: AdminDb, eventId: string): Promise<MatchDocRow[]> {
  const { data } = await db.from("game_sheet_imports").select(MATCH_DOC_COLUMNS).eq("event_id", eventId).order("created_at", { ascending: true });
  return (data ?? []) as unknown as MatchDocRow[];
}

/** Converte as linhas da BD nas entradas da reconciliação (só documentos que contam). */
export function buildInputs(game: MatchGame, docs: MatchDocRow[]): { official: OfficialInput[]; pro: ProInput[]; skipped: string[] } {
  const official: OfficialInput[] = [];
  const pro: ProInput[] = [];
  const skipped: string[] = [];
  const names = { home: game.home, away: game.away };
  for (const d of docs) {
    const counted = d.team_id ? TEAM_COUNTED.has(d.status) : ADMIN_COUNTED.has(d.status);
    if (!counted) continue;
    const teamSide = sideOfTeam(game, d.team_id);
    if (d.team_id && !teamSide) { skipped.push(d.id); continue; }
    const who = teamSide ? game[teamSide] : "Admin";
    if (d.doc_type === "pro_stats") {
      const p = ProStatsDataSchema.safeParse(d.stats_data);
      if (!p.success) { skipped.push(d.id); continue; }
      pro.push({
        docType: "pro_stats", importId: d.id, teamSide, createdAt: d.created_at, confidence: p.data.aiConfidence,
        label: `Estatística profissional${p.data.app ? ` (${p.data.app})` : ""} — ${who}`, data: p.data,
        issues: validateProStats(p.data, { docId: d.id, names }),
      });
    } else {
      const s = SheetDataSchema.safeParse(d.sheet_data);
      if (!s.success) { skipped.push(d.id); continue; }
      official.push({
        docType: "official_sheet", importId: d.id, teamSide, createdAt: d.created_at, confidence: s.data.aiConfidence,
        label: `Folha oficial — ${who}`, sheet: s.data, analysis: analyzeSheet(s.data),
      });
    }
  }
  return { official, pro, skipped };
}

/**
 * Jogadores conhecidos de cada equipa, por ordem de autoridade: plantel registado pelo delegado
 * (league_team_players) → plantel HoopHub do clube dono → histórico de estatísticas da liga.
 */
export async function loadKnownPlayers(db: AdminDb, game: MatchGame): Promise<{ home: KnownPlayer[]; away: KnownPlayer[] }> {
  const out: { home: KnownPlayer[]; away: KnownPlayer[] } = { home: [], away: [] };
  try {
    const rosters = await loadGameRosters(db, game);
    for (const side of ["home", "away"] as const) {
      out[side].push(...rosters[side].map((r) => ({ name: fullName(r), number: r.number, rosterId: r.id, source: "roster" as const })));
    }
    const { data: ours } = await db.from("league_teams").select("id").eq("is_our_team", true).maybeSingle();
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? game.homeTeamId : game.awayTeamId;
      if (!teamId) continue;
      // o plantel HoopHub já entrou como "roster" (fonte única); só recorre ao legado se não houver
      if (ours?.id === teamId && !rosters[side].some((r) => r.source === "hoophub")) {
        const { data: roster } = await db.from("v_active_roster").select("player_id, name, number");
        out[side].push(...(roster ?? []).map((r) => ({ name: r.name as string, number: (r.number as number | null) ?? null, hoophubPlayerId: r.player_id as string, source: "club" as const })));
      }
      const { data: hist } = await db.from("league_game_player_stats").select("nome, numero").eq("team_id", teamId).neq("event_id", game.id).limit(400);
      const seen = new Set(out[side].map((k) => `${k.number}:${normalizeName(k.name)}`));
      for (const h of hist ?? []) {
        const k = `${h.numero ?? null}:${normalizeName(h.nome as string)}`;
        if (seen.has(k) || /^n\.º|^jogador$/i.test(h.nome as string)) continue;
        seen.add(k);
        out[side].push({ name: h.nome as string, number: (h.numero as number | null) ?? null, source: "history" });
      }
    }
  } catch (e) {
    console.warn("[match-docs] jogadores conhecidos indisponíveis", e);
  }
  return out;
}

/** Hash das entradas: muda só quando um documento muda (estado/dados) — evita IA repetida. */
export function inputsHash(docs: MatchDocRow[]): string {
  const key = docs
    .filter((d) => (d.team_id ? TEAM_COUNTED.has(d.status) : ADMIN_COUNTED.has(d.status)))
    .map((d) => `${d.id}|${d.doc_type}|${d.status}|${d.image_sha256}|${createHash("sha1").update(JSON.stringify(d.doc_type === "pro_stats" ? d.stats_data : d.sheet_data) ?? "").digest("hex")}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(key).digest("hex");
}

export interface ReconciliationRow {
  event_id: string;
  status: string;
  consolidated: ReconciliationResult | null;
  discrepancies: unknown;
  math_issues: unknown;
  sources: unknown;
  confidence: number | null;
  inputs_hash: string | null;
  ai_review: AiReview | null;
  ai_usage: unknown;
  ai_inputs_hash: string | null;
  overrides: Record<string, Val>;
  run_count: number;
  error: string | null;
  analyzed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  updated_at: string;
}

export async function loadReconciliationRow(db: AdminDb, eventId: string): Promise<ReconciliationRow | null> {
  const { data } = await db.from("match_reconciliations").select("*").eq("event_id", eventId).maybeSingle();
  return (data as ReconciliationRow | null) ?? null;
}

export type AiMode = "auto" | "force" | "off";

/** Uma análise IA em curso há mais do que isto é considerada abandonada. */
const STALE_ANALYZING_MS = 2 * 60 * 1000;

/**
 * Corre a reconciliação do jogo e grava o resultado. A análise cruzada DeepSeek só corre
 * quando as duas equipas já submeteram (ou se o admin a pedir) e só se os documentos
 * mudaram desde a última análise (cache por hash).
 */
export async function runReconciliation(
  eventId: string,
  opts: { ai?: AiMode; db?: AdminDb } = {},
): Promise<{ ok: true; result: ReconciliationResult; aiRan: boolean; aiError: string | null } | { ok: false; error: string }> {
  const db = opts.db ?? (await createAdminClient());
  const aiMode = opts.ai ?? "auto";
  const game = await loadMatchGame(db, eventId);
  if (!game) return { ok: false, error: "Jogo não encontrado" };

  const [docs, row, known] = await Promise.all([loadMatchDocs(db, eventId), loadReconciliationRow(db, eventId), loadKnownPlayers(db, game)]);
  const { official, pro } = buildInputs(game, docs);
  const hash = inputsHash(docs);
  const overrides = row?.overrides ?? {};
  const cachedAi = row?.ai_review && row.ai_inputs_hash === hash ? row.ai_review : null;

  let result = reconcile({ game, official, pro, overrides, known, ai: cachedAi });
  let aiReview = cachedAi;
  let aiUsage: unknown = row?.ai_usage ?? null;
  let aiInputsHash = cachedAi ? hash : row?.ai_inputs_hash ?? null;
  let aiRan = false;
  let aiError: string | null = null;

  const docsCount = official.length + pro.length;
  const bothTeams = result.teamsSubmitted.home && result.teamsSubmitted.away;
  const analyzingFresh = row?.status === "analyzing" && Date.now() - new Date(row.updated_at).getTime() < STALE_ANALYZING_MS;
  const wantAi = aiMode === "force" || (aiMode === "auto" && bothTeams && hash !== row?.ai_inputs_hash);
  if (wantAi && docsCount > 0 && process.env.DEEPSEEK_API_KEY && !(analyzingFresh && aiMode !== "force")) {
    await db.from("match_reconciliations").upsert({
      event_id: eventId, status: "analyzing", overrides, updated_at: new Date().toISOString(),
    }, { onConflict: "event_id" });
    const started = Date.now();
    const ai = await withAiAttribution({ leagueTeamId: null, feature: "liga-conciliacao" }, () => crossCheckWithAI({ game, official, pro, result }));
    aiRan = true;
    if (ai.ok) {
      aiReview = ai.review;
      aiInputsHash = hash;
      aiUsage = { ...ai.meta, ranAt: new Date().toISOString(), durationMs: Date.now() - started };
      result = reconcile({ game, official, pro, overrides, known, ai: aiReview });
    } else {
      aiError = ai.error;
      aiUsage = { ...(ai.meta ?? {}), error: ai.error, ranAt: new Date().toISOString() };
      console.error(`[match-docs] análise cruzada falhou event=${eventId}: ${ai.error}`);
    }
  }

  const now = new Date().toISOString();
  const { error } = await db.from("match_reconciliations").upsert({
    event_id: eventId,
    status: result.status,
    consolidated: result,
    discrepancies: result.discrepancies,
    math_issues: result.mathIssues,
    sources: docs.map((d) => ({ id: d.id, team_id: d.team_id, doc_type: d.doc_type, status: d.status, counted: result.usedDocs.includes(d.id) })),
    confidence: result.confidence,
    inputs_hash: hash,
    ai_review: aiReview,
    ai_usage: aiUsage,
    ai_inputs_hash: aiInputsHash,
    overrides,
    run_count: (row?.run_count ?? 0) + 1,
    error: aiError,
    analyzed_at: now,
    updated_at: now,
  }, { onConflict: "event_id" });
  if (error) {
    console.error(`[match-docs] gravação da reconciliação falhou event=${eventId}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  console.info(
    `[match-docs] event=${eventId} status=${result.status} publishable=${result.publishable} docs=${docsCount} ` +
    `disc=${result.discrepancies.length} high=${result.discrepancies.filter((d) => d.severity === "high" && !d.resolved).length} ` +
    `math=${result.mathIssues.filter((i) => i.severity === "error").length} ai=${aiRan ? (aiError ? "erro" : "ok") : "cache/skip"}`,
  );
  return { ok: true, result, aiRan, aiError };
}

/** Corre a reconciliação sem deixar que uma falha afete o pedido principal (uso em after()). */
export async function safeRunReconciliation(eventId: string, ai: AiMode = "auto"): Promise<void> {
  try {
    const r = await runReconciliation(eventId, { ai });
    if (!r.ok) console.error(`[match-docs] reconciliação falhou event=${eventId}: ${r.error}`);
  } catch (e) {
    console.error(`[match-docs] reconciliação lançou exceção event=${eventId}`, e);
  }
}

/** Texto do plantel registado das duas equipas para os prompts do DeepSeek ("" se não houver). */
export async function rosterHintForEvent(eventId: string): Promise<string> {
  try {
    const db = await createAdminClient();
    const game = await loadMatchGame(db, eventId);
    if (!game) return "";
    return rosterPromptBlock(await loadGameRosters(db, game), game);
  } catch {
    return "";
  }
}
