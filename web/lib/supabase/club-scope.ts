import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient as createSessionClient } from "./server";
import { createRawServiceClient } from "./service-raw";

/** Tabelas com club_id: o service role só vê/altera as do clube do utilizador. */
export const SCOPED_TABLES = new Set([
  "seasons", "players", "trainings", "training_attendance", "training_rsvps", "training_notes",
  "training_recurrence_rules", "events", "game_callups", "game_availability", "game_sessions",
  "financial_entries", "financial_expenses", "financial_cash_movements", "player_payments",
  "player_payments_history", "payment_receipts", "documents", "chats", "birthday_messages", "plays",
  "team_kits", "club_events", "access_requests", "palmares",
  "hist_seasons", "hist_games", "hist_players", "hist_player_stats",
]);

export const NO_CLUB = "00000000-0000-0000-0000-000000000000";
export type Scope = { clubId: string } | null;
export type Step = [string, unknown[]];
type Fromable = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function withClub(payload: unknown, clubId: string): unknown {
  if (Array.isArray(payload)) return payload.map((p) => ({ ...(p as object), club_id: clubId }));
  return { ...(payload as object), club_id: clubId };
}

/** Reaplica a cadeia de chamadas ao cliente real, acrescentando o filtro/valor de clube. (Pura: testável.) */
export function replay(client: Fromable, table: string, steps: Step[], scope: Scope, memberIds: string[] | null) {
  let b = client.from(table);
  const isUsers = table === "users";
  const scoped = !!scope && (SCOPED_TABLES.has(table) || (isUsers && memberIds !== null));
  steps.forEach(([method, args], i) => {
    let a = args;
    if (scoped && i === 0 && (method === "insert" || method === "upsert") && !isUsers && table !== "events") {
      a = [withClub(args[0], scope!.clubId), ...args.slice(1)];
    }
    b = b[method](...a);
    if (scoped && i === 0 && (method === "select" || method === "update" || method === "delete")) {
      if (isUsers) b = b.in("id", memberIds!.length ? memberIds! : [NO_CLUB]);
      else if (table === "events") b = b.or(`club_id.eq.${scope!.clubId},club_id.is.null`); // null = jogos da Liga
      else b = b.eq("club_id", scope!.clubId);
    }
  });
  return b;
}

// ── Resolução do clube do pedido (cache curta por sessão) ─────────────────────
const TTL_MS = 30_000;
const cache = new Map<string, { scope: Scope; exp: number }>();

async function sessionFingerprint(): Promise<string | null> {
  try {
    const all = (await cookies()).getAll().filter((c) => c.name.startsWith("sb-"));
    if (all.length === 0) return null;
    return createHash("sha1").update(all.map((c) => c.name + "=" + c.value).join("|")).digest("hex");
  } catch {
    return null; // fora de um pedido (cron, scripts)
  }
}

export async function resolveScope(): Promise<Scope> {
  const fp = await sessionFingerprint();
  if (!fp) return null;
  const hit = cache.get(fp);
  if (hit && hit.exp > Date.now()) return hit.scope;

  let scope: Scope = null;
  try {
    const { data: { user } } = await (await createSessionClient()).auth.getUser();
    if (user) {
      const raw = createRawServiceClient();
      const [{ data: members }, { data: profile }] = await Promise.all([
        raw.from("club_members").select("club_id, clubs!inner(active)").eq("user_id", user.id).eq("active", true)
          .eq("clubs.active", true).order("created_at", { ascending: true }).limit(1),
        raw.from("users").select("id").eq("id", user.id).maybeSingle(),
      ]);
      const clubId = members?.[0]?.club_id as string | undefined;
      // Com perfil mas sem clube ativo: falha fechada (não vê nada). Sem perfil de gestão (ex.: delegado da Liga): sem filtro.
      scope = clubId ? { clubId } : profile ? { clubId: NO_CLUB } : null;
    }
  } catch {
    scope = null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(fp, { scope, exp: Date.now() + TTL_MS });
  return scope;
}

async function memberIdsOf(clubId: string): Promise<string[]> {
  if (clubId === NO_CLUB) return [];
  const { data } = await createRawServiceClient().from("club_members").select("user_id").eq("club_id", clubId).eq("active", true);
  return (data ?? []).map((r) => r.user_id as string);
}

function lazyBuilder(client: Fromable, table: string) {
  const steps: Step[] = [];
  const run = async () => {
    const scope = await resolveScope();
    const ids = table === "users" && scope ? await memberIdsOf(scope.clubId) : null;
    return replay(client, table, steps, scope, ids);
  };
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej);
      if (typeof prop === "symbol") return undefined;
      return (...args: unknown[]) => { steps.push([prop, args]); return proxy; };
    },
  });
  return proxy;
}

/** Envolve um cliente service-role para isolar por clube as tabelas com club_id (e `users`). */
export function scopeClient<T extends Fromable>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) =>
          SCOPED_TABLES.has(table) || table === "users" ? lazyBuilder(target, table) : target.from(table);
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
