import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const MAX_ITERATIONS = 3;

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

// ─── Types ────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  title: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  opponent: string | null;
  season_id: string;
  created_at: string;
}

interface Action {
  round: number;
  keep: string;
  remove: string[];
  reason: string;
}

interface DSResponse {
  duplicates_found: boolean;
  actions: Action[];
  summary: string;
}

// ─── Normalização ─────────────────────────────────────────────────

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJornada(title: string | null): number {
  if (!title) return 0;
  const m = title.match(/[Jj]ornada\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function extractTeams(title: string | null): { home: string; away: string } {
  if (!title) return { home: "", away: "" };
  const stripped = title.replace(/^[Jj]ornada\s*\d+\s*[-–—]\s*/i, "").trim();
  const match = stripped.match(/^(.+?)\s+vs\s+(.+)$/i);
  if (match) return { home: match[1].trim(), away: match[2].trim() };
  return { home: stripped, away: "" };
}

// ─── Detecção determinística ──────────────────────────────────────
// Groups by (season_id, jornada, normalized_opponent).
// Uses jornada when available so year-shifted duplicates (2025 vs 2026) are caught.
// Falls back to exact event_date when jornada is absent.

function findDupGroups(events: EventRow[]): EventRow[][] {
  const groupMap = new Map<string, EventRow[]>();
  for (const evt of events) {
    const jornada = extractJornada(evt.title);
    const normOpp = normalize(evt.opponent);
    const key = jornada > 0
      ? `${evt.season_id}|j${jornada}|${normOpp}`
      : `${evt.season_id}|${evt.event_date}|${normOpp}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(evt);
  }
  return [...groupMap.values()].filter(g => g.length > 1);
}

// Keep the oldest record (by created_at); mark the rest for removal.
function determineAction(group: EventRow[]): Action {
  const sorted = [...group].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return {
    round: extractJornada(sorted[0].title),
    keep: sorted[0].id,
    remove: sorted.slice(1).map(e => e.id),
    reason: "Duplicação determinística: mesma jornada e oponente. Mantido o registo mais antigo.",
  };
}

// ─── DeepSeek call (non-fatal: fallback to deterministic on failure) ─

async function callDeepSeek(
  rounds: object[],
  apiKey: string
): Promise<DSResponse | null> {
  const userMsg = `Analisa estes grupos de jogos duplicados e confirma quais eliminar.

CRITÉRIOS DE DUPLICAÇÃO (todos os campos após normalização de acentos/capitalização/espaços):
1. home_team igual
2. away_team igual
3. date igual OU mesma data com ano diferente na mesma jornada (ex: 2025-11-13 e 2026-11-13 — duplicados)
4. time igual
5. location igual (ou vazio em ambos)

REGRA DE DECISÃO:
- Manter o game_id com created_at mais antigo (aparece primeiro na lista — já ordenado).
- Marcar TODOS os restantes para eliminação.

Devolve APENAS este JSON (sem markdown, sem texto extra):
{
  "duplicates_found": true,
  "actions": [
    {
      "round": <número da jornada>,
      "keep": "<game_id a manter>",
      "remove": ["<game_id a eliminar>"],
      "reason": "Duplicação confirmada por critérios rígidos."
    }
  ],
  "summary": "X jogos duplicados identificados. Y jogos devem ser eliminados."
}

Se não houver duplicados: { "duplicates_found": false, "actions": [], "summary": "Sem duplicados." }

Dados (já ordenados por created_at — o primeiro de cada grupo deve ser mantido):
${JSON.stringify({ operation: "detect_and_remove_duplicates", rounds }, null, 2)}`;

  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: "És um assistente de auditoria de dados desportivos. Respondes sempre em JSON puro, sem markdown.",
          },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!resp.ok) {
      console.error(`[deepseek/calendar-cleanup] API error ${resp.status}`);
      return null;
    }

    const json = await resp.json();
    const tokens = json.usage;
    console.log(
      `[deepseek/calendar-cleanup] tokens: ${tokens?.prompt_tokens} prompt + ${tokens?.completion_tokens} completion`
    );

    const raw = (json.choices?.[0]?.message?.content ?? "") as string;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as DSResponse;
  } catch (e) {
    console.error("[deepseek/calendar-cleanup] fallback to deterministic:", (e as Error).message);
    return null;
  }
}

// ─── Merge: deterministic is ground truth, DeepSeek enriches reasons ─
// Ensures: keep IDs are never removed; only valid DB IDs are in remove lists.

function mergeActions(
  deterministicActions: Action[],
  dsResponse: DSResponse | null,
  validIds: Set<string>
): Action[] {
  const keepIds = new Set(deterministicActions.map(a => a.keep));

  return deterministicActions
    .map(det => {
      const dsAction = dsResponse?.actions?.find(
        d => d.keep === det.keep || det.remove.some(id => d.remove.includes(id))
      );
      return {
        round: det.round,
        keep: det.keep,
        remove: det.remove.filter(id => validIds.has(id) && !keepIds.has(id)),
        reason: dsAction?.reason ?? det.reason,
      };
    })
    .filter(a => a.remove.length > 0);
}

// ─── POST /api/deepseek/calendar-cleanup ─────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return fail("DEEPSEEK_API_KEY não configurada", 500);

  const admin = await createAdminClient();

  // Admin only
  const { data: userRow } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (userRow?.role !== "admin") return fail("Acesso negado — apenas admins", 403);

  const body = await req.json().catch(() => ({})) as { season_id?: string };
  const seasonId = body.season_id;

  // ── Iterative cleanup loop ─────────────────────────────────────
  let iteration = 0;
  const allDeleted: string[] = [];
  const allProtected: string[] = [];
  let lastActions: Action[] = [];
  let totalAnalyzed = 0;
  let lastSummary = "";

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // Fetch current DB state (re-fetch each iteration so we see deletions)
    let q = admin
      .from("events")
      .select("id, title, event_date, event_time, location, opponent, season_id, created_at")
      .eq("type", "jogo")
      .order("created_at", { ascending: true });
    if (seasonId) q = q.eq("season_id", seasonId);

    const { data: eventsRaw, error: fetchErr } = await q;
    if (fetchErr) return fail(`Erro ao carregar eventos: ${fetchErr.message}`, 500);

    const allEvents = (eventsRaw ?? []) as EventRow[];
    totalAnalyzed = allEvents.length;

    if (allEvents.length === 0) {
      lastSummary = "Nenhum jogo encontrado na temporada.";
      break;
    }

    // ── Detecção determinística ──────────────────────────────
    const dupGroups = findDupGroups(allEvents);

    if (dupGroups.length === 0) {
      lastSummary = allDeleted.length > 0
        ? `Limpeza concluída em ${iteration - 1} iteração(ões). ${allDeleted.length} duplicado(s) eliminado(s).`
        : "Nenhum duplicado encontrado — base de dados limpa.";
      break;
    }

    console.log(
      `[deepseek/calendar-cleanup] iter ${iteration}: ${dupGroups.length} grupo(s) duplicado(s) encontrado(s)`
    );

    // ── Deterministic actions ─────────────────────────────────
    const deterministicActions = dupGroups.map(determineAction);
    const validIds = new Set(allEvents.map(e => e.id));

    // ── Build DeepSeek payload ────────────────────────────────
    const rounds = dupGroups.map(group => ({
      round_number: extractJornada(group[0].title),
      games: group.map(g => {
        const { home, away } = extractTeams(g.title);
        return {
          game_id: g.id,
          home_team: home || g.opponent || "",
          away_team: away,
          date: g.event_date,
          time: g.event_time ?? "",
          location: g.location ?? "",
          created_at: g.created_at,
          source: "database",
        };
      }),
    }));

    // ── Call DeepSeek (non-fatal) ─────────────────────────────
    const dsResponse = await callDeepSeek(rounds, apiKey);

    // ── Merge: deterministic wins, DeepSeek enriches reasons ──
    const validatedActions = mergeActions(deterministicActions, dsResponse, validIds);
    lastActions = validatedActions;
    lastSummary = dsResponse?.summary
      ?? `${dupGroups.length} grupo(s) duplicado(s) identificado(s).`;

    const toRemove = validatedActions.flatMap(a => a.remove);
    if (toRemove.length === 0) break;

    // ── Safety check ──────────────────────────────────────────
    const [{ data: sessions }, { data: callups }] = await Promise.all([
      admin.from("game_sessions").select("event_id").in("event_id", toRemove),
      admin.from("game_callups").select("game_id").in("game_id", toRemove),
    ]);

    const protectedIds = new Set([
      ...(sessions ?? []).map(s => s.event_id as string),
      ...(callups ?? []).map(c => c.game_id as string),
    ]);

    const safeToDelete = toRemove.filter(id => !protectedIds.has(id));
    const newlyProtected = toRemove.filter(
      id => protectedIds.has(id) && !allProtected.includes(id)
    );
    allProtected.push(...newlyProtected);

    if (safeToDelete.length === 0) {
      lastSummary = "Duplicados encontrados mas todos estão protegidos (têm stats/convocatórias).";
      break;
    }

    // ── Delete ────────────────────────────────────────────────
    const { error: delErr } = await admin
      .from("events")
      .delete()
      .in("id", safeToDelete);

    if (delErr) return fail(`Erro ao eliminar (iter ${iteration}): ${delErr.message}`, 500);

    allDeleted.push(...safeToDelete);
    console.log(
      `[deepseek/calendar-cleanup] iter ${iteration}: deleted ${safeToDelete.length} events`
    );
  }

  // ── Post-deletion: final local audit (no DeepSeek) ────────────
  // Re-fetch and check — purely informational for the report.
  let residualDups = 0;
  if (allDeleted.length > 0) {
    let qFinal = admin
      .from("events")
      .select("id, title, event_date, event_time, location, opponent, season_id, created_at")
      .eq("type", "jogo")
      .order("created_at", { ascending: true });
    if (seasonId) qFinal = qFinal.eq("season_id", seasonId);
    const { data: finalEvents } = await qFinal;
    residualDups = findDupGroups((finalEvents ?? []) as EventRow[]).length;
    if (residualDups > 0) {
      console.warn(
        `[deepseek/calendar-cleanup] ${residualDups} grupo(s) residuais após ${iteration} iterações (todos protegidos)`
      );
    }
  }

  const roundsAffected = new Set(
    lastActions
      .filter(a => a.remove.some(id => allDeleted.includes(id)))
      .map(a => a.round)
  ).size;

  return ok({
    duplicates_found: allDeleted.length > 0 || allProtected.length > 0,
    actions: lastActions,
    duplicates: lastActions, // backwards compat for frontend modal
    deleted: allDeleted,
    protected: allProtected,
    residual_duplicates: residualDups,
    summary: lastSummary,
    games_analyzed: totalAnalyzed,
    rounds_affected: roundsAffected,
    iterations: iteration,
  });
}
