import "server-only";
import { gameEndsAt, trainingEndsAt, highlightEndsAt, isHighlighted, type HighlightTarget } from "./expiry";
import type { AnnouncementDTO, AnnouncementTarget } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/** Comunicados mais antigos que isto nunca estão em destaque (cobre jogos/treinos afetos até ~90 dias à frente). */
export const HIGHLIGHT_LOOKBACK_DAYS = 180;

type One<T> = T | T[] | null;
const one = <T,>(v: One<T> | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface EventEmbed {
  id: string; title: string; opponent: string | null; competition: string | null;
  event_date: string; event_time: string | null; deleted_at: string | null;
}
interface TrainingEmbed {
  id: string; date: string; start_time: string | null; end_time: string | null; type: string | null; deleted_at: string | null;
}
interface Row {
  id: string; title: string; body: string; created_at: string; author_id: string | null;
  event_id: string | null; training_id: string | null;
  event?: One<EventEmbed>; training?: One<TrainingEmbed>;
}

const COLS =
  "id,title,body,created_at,author_id,event_id,training_id," +
  "event:events(id,title,opponent,competition,event_date,event_time,deleted_at)," +
  "training:trainings(id,date,start_time,end_time,type,deleted_at)";

/** Jogo/treino afeto (se existir) + dados para o destaque. */
function resolveTarget(r: Row): { target: AnnouncementTarget | null; removed: boolean; hl: HighlightTarget | null } {
  const ev = one(r.event);
  if (r.event_id) {
    if (!ev) return { target: null, removed: true, hl: null };
    const endsAt = gameEndsAt(ev.event_date, ev.event_time);
    const target: AnnouncementTarget = {
      kind: "game", id: ev.id, title: ev.title, opponent: ev.opponent, competition: ev.competition,
      date: ev.event_date, time: ev.event_time ? ev.event_time.slice(0, 5) : null, ends_at: endsAt.toISOString(),
    };
    const removed = ev.deleted_at != null;
    return { target, removed, hl: { kind: "game", endsAt, removed } };
  }
  const tr = one(r.training);
  if (r.training_id) {
    if (!tr) return { target: null, removed: true, hl: null };
    const endsAt = trainingEndsAt(tr);
    const target: AnnouncementTarget = {
      kind: "training", id: tr.id, date: tr.date, time: tr.start_time ? tr.start_time.slice(0, 5) : null,
      training_type: tr.type, ends_at: endsAt.toISOString(),
    };
    const removed = tr.deleted_at != null;
    return { target, removed, hl: { kind: "training", endsAt, removed } };
  }
  return { target: null, removed: false, hl: null };
}

async function authorsOf(db: Db, ids: string[]): Promise<Map<string, { id: string; name: string; role: string }>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return new Map();
  const { data } = await db.from("users").select("id,name,role").in("id", uniq);
  return new Map(((data ?? []) as Array<{ id: string; name: string; role: string }>).map((u) => [u.id, u]));
}

async function readIds(db: Db, userId: string | null, ids: string[]): Promise<Set<string>> {
  if (!userId || ids.length === 0) return new Set();
  const { data } = await db.from("announcement_reads").select("announcement_id").eq("user_id", userId).in("announcement_id", ids);
  return new Set(((data ?? []) as Array<{ announcement_id: string }>).map((r) => r.announcement_id));
}

async function toDTOs(db: Db, rows: Row[], userId: string | null, now: Date): Promise<AnnouncementDTO[]> {
  const [authors, read] = await Promise.all([
    authorsOf(db, rows.map((r) => r.author_id).filter((x): x is string => !!x)),
    readIds(db, userId, rows.map((r) => r.id)),
  ]);
  return rows.map((r) => {
    const { target, removed, hl } = resolveTarget(r);
    return {
      id: r.id, title: r.title, body: r.body, created_at: r.created_at,
      author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
      target,
      target_removed: removed,
      highlighted: isHighlighted(r.created_at, hl, now),
      highlight_until: highlightEndsAt(r.created_at, hl).toISOString(),
      // Os próprios comunicados nunca contam como "por ler"
      unread: !!userId && r.author_id !== userId && !read.has(r.id),
    };
  });
}

/** Lista paginada (mais recentes primeiro) para a página de Comunicados. */
export async function listAnnouncements(
  db: Db,
  opts: { userId: string | null; limit?: number; before?: string | null; now?: Date },
): Promise<{ announcements: AnnouncementDTO[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  let q = db.from("announcements").select(COLS).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit + 1);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  const page = rows.slice(0, limit);
  return { announcements: await toDTOs(db, page, opts.userId, opts.now ?? new Date()), hasMore: rows.length > limit };
}

/** Comunicados em destaque agora (Dashboard): soltos até 72h; afetos até ao fim do jogo/treino. */
export async function listHighlighted(db: Db, opts: { userId: string | null; now?: Date }): Promise<AnnouncementDTO[]> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - HIGHLIGHT_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data } = await db.from("announcements").select(COLS)
    .is("deleted_at", null).gt("created_at", since)
    .order("created_at", { ascending: false }).limit(200);
  const dtos = await toDTOs(db, (data ?? []) as Row[], opts.userId, now);
  return dtos.filter((a) => a.highlighted);
}

/** Últimos N comunicados (qualquer idade), para o cartão "Comunicados" do jogador. */
export async function listLatest(db: Db, opts: { userId: string | null; limit: number; now?: Date }): Promise<AnnouncementDTO[]> {
  return (await listAnnouncements(db, { userId: opts.userId, limit: opts.limit, now: opts.now })).announcements;
}

/** Quantos comunicados dos últimos 30 dias o utilizador ainda não viu (badge do menu). */
export async function countUnread(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { data } = await db.from("announcements").select("id")
    .is("deleted_at", null).gt("created_at", since).neq("author_id", userId).limit(200);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const read = await readIds(db, userId, ids);
  return ids.filter((id) => !read.has(id)).length;
}
