import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@/lib/supabase/server";
import { createRawServiceClient } from "@/lib/supabase/service-raw";

/**
 * Controlo do gasto DeepSeek por clube. Custos ESTIMADOS a partir dos tokens devolvidos pela API.
 * Tarifas em USD por 1M tokens (por defeito: tarifa de ponta do deepseek-flash, a mais alta).
 * Ajustáveis por env: AI_RATE_INPUT_USD, AI_RATE_CACHED_USD, AI_RATE_OUTPUT_USD, AI_USD_TO_EUR.
 */
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n >= 0 ? n : d;
};
export function rates() {
  return {
    input: num(process.env.AI_RATE_INPUT_USD, 0.3),
    cached: num(process.env.AI_RATE_CACHED_USD, 0.006),
    output: num(process.env.AI_RATE_OUTPUT_USD, 1.2),
    usdToEur: num(process.env.AI_USD_TO_EUR, 0.92),
  };
}

export function costEur(t: { promptTokens: number; cacheHitTokens: number; completionTokens: number }): number {
  const r = rates();
  const hit = Math.min(t.cacheHitTokens, t.promptTokens);
  const miss = Math.max(0, t.promptTokens - hit);
  const usd = (miss * r.input + hit * r.cached + t.completionTokens * r.output) / 1_000_000;
  return usd * r.usdToEur;
}

/** 'YYYY-MM' no fuso de Lisboa. */
export function lisbonMonth(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** Atribuição explícita (Liga INATEL): o consumo é registado na equipa/clube que submeteu o documento. */
export interface AiAttribution { leagueTeamId?: string | null; feature: string }
const attribution = new AsyncLocalStorage<AiAttribution>();
export function withAiAttribution<T>(a: AiAttribution, fn: () => Promise<T>): Promise<T> {
  return attribution.run(a, fn);
}

/** Define a atribuição para o resto do pedido atual (útil em handlers longos). */
export function enterAiAttribution(a: AiAttribution): void {
  attribution.enterWith(a);
}

const teamClubCache = new Map<string, { clubId: string | null; exp: number }>();
async function clubOfLeagueTeam(teamId: string): Promise<string | null> {
  const hit = teamClubCache.get(teamId);
  if (hit && hit.exp > Date.now()) return hit.clubId;
  const { data } = await createRawServiceClient().from("clubs").select("id").eq("league_team_id", teamId).maybeSingle();
  const clubId = (data?.id as string | undefined) ?? null;
  teamClubCache.set(teamId, { clubId, exp: Date.now() + 5 * 60_000 });
  return clubId;
}

export interface AiContext {
  clubId: string | null;
  userId: string | null;
  isMaster: boolean;
}

/** Clube/utilizador do pedido atual (null fora de um pedido com sessão, ex.: cron). Nunca lança. */
export async function resolveAiContext(): Promise<AiContext | null> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return null;
    const raw = createRawServiceClient();
    const [{ data: members }, { data: master }] = await Promise.all([
      raw.from("club_members").select("club_id, clubs!inner(active)").eq("user_id", user.id).eq("active", true)
        .eq("clubs.active", true).order("created_at", { ascending: true }).limit(1),
      raw.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    return { clubId: (members?.[0]?.club_id as string | undefined) ?? null, userId: user.id, isMaster: !!master };
  } catch {
    return null;
  }
}

export type BudgetState = { allowed: true } | { allowed: false; spentEur: number; limitEur: number };

/** Bloqueia só utilizadores de um clube sem ser Master Admin que já atingiram o limite do mês. Falha aberta. */
export async function checkAiBudget(ctx: AiContext | null): Promise<BudgetState> {
  if (!ctx?.clubId || ctx.isMaster) return { allowed: true };
  try {
    const raw = createRawServiceClient();
    const [{ data: club }, { data: rows }] = await Promise.all([
      raw.from("clubs").select("ai_monthly_budget_eur").eq("id", ctx.clubId).maybeSingle(),
      raw.from("ai_usage").select("cost_eur").eq("club_id", ctx.clubId).eq("month", lisbonMonth()).eq("source", "app"),
    ]);
    const limitEur = Number(club?.ai_monthly_budget_eur ?? 0.1);
    const spentEur = (rows ?? []).reduce((s, r) => s + Number(r.cost_eur ?? 0), 0);
    return spentEur >= limitEur ? { allowed: false, spentEur, limitEur } : { allowed: true };
  } catch {
    return { allowed: true };
  }
}

export const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export async function recordAiUsage(
  ctx: AiContext | null,
  u: { feature: string; model: string; promptTokens: number; cacheHitTokens: number; completionTokens: number; ok: boolean },
): Promise<void> {
  try {
    if (u.promptTokens === 0 && u.completionTokens === 0) return;
    const attr = attribution.getStore();
    const leagueTeamId = attr?.leagueTeamId ?? null;
    const clubId = attr ? (leagueTeamId ? await clubOfLeagueTeam(leagueTeamId) : null) : (ctx?.clubId ?? null);
    await createRawServiceClient().from("ai_usage").insert({
      club_id: clubId,
      league_team_id: leagueTeamId,
      source: attr ? "liga" : "app",
      user_id: ctx?.userId ?? null,
      month: lisbonMonth(),
      feature: (attr?.feature ?? u.feature).slice(0, 60),
      model: u.model,
      prompt_tokens: u.promptTokens,
      cache_hit_tokens: u.cacheHitTokens,
      completion_tokens: u.completionTokens,
      cost_eur: costEur(u).toFixed(6),
      ok: u.ok,
    });
  } catch (e) {
    console.warn("[ai-usage] falha a registar consumo:", e instanceof Error ? e.message : e);
  }
}

/** Para chamadas diretas à API (sem deepseekJSON): lança erro em português se o clube esgotou o limite do mês. */
export async function guardAiBudget(): Promise<void> {
  const b = await checkAiBudget(await resolveAiContext());
  if (!b.allowed) {
    throw new Error(`A equipa atingiu o limite mensal de IA (${eur(b.limitEur)}). Volta a tentar no próximo mês ou fala com o Master Admin.`);
  }
}

/** Para chamadas diretas à API: regista o consumo a partir do campo `usage` da resposta. */
export async function trackRawUsage(
  feature: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number } | undefined,
): Promise<void> {
  await recordAiUsage(await resolveAiContext(), {
    feature, model,
    promptTokens: usage?.prompt_tokens ?? 0,
    cacheHitTokens: usage?.prompt_cache_hit_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    ok: true,
  });
}
