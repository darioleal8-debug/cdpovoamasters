import { createAdminClient } from "@/lib/supabase/server";

/**
 * Notícias manuais da Liga INATEL: o admin escreve título e corpo, sem DeepSeek.
 * Pode estar ligada a um jogo (substitui a notícia desse jogo) ou ser avulsa.
 */

export const MANUAL_NEWS_LIMITS = { title: 120, excerpt: 300, body: 20_000 } as const;

export type ManualNewsInput = {
  newsId?: string | null;
  gameId?: string | null;
  title: string;
  excerpt?: string | null;
  body: string;
};

export type ManualNewsClean = { title: string; excerpt: string; body: string };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Entrada automática a partir do corpo quando o admin não a escreve. */
export function excerptFromBody(body: string, max: number = 200): string {
  const first = body.split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) ?? "";
  const flat = first.replace(/\s+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Valida e normaliza o que o admin escreveu. */
export function validateManualNews(input: {
  title?: unknown; excerpt?: unknown; body?: unknown;
}): { ok: true; data: ManualNewsClean } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const title = str(input.title).replace(/\s+/g, " ").trim();
  const body = str(input.body).replace(/\r\n/g, "\n").trim();
  let excerpt = str(input.excerpt).replace(/\s+/g, " ").trim();

  if (!title) return { ok: false, error: "O título é obrigatório." };
  if (!body) return { ok: false, error: "O corpo da notícia é obrigatório." };
  if (title.length > MANUAL_NEWS_LIMITS.title) return { ok: false, error: `Título demasiado longo (máx. ${MANUAL_NEWS_LIMITS.title} caracteres).` };
  if (excerpt.length > MANUAL_NEWS_LIMITS.excerpt) return { ok: false, error: `Entrada demasiado longa (máx. ${MANUAL_NEWS_LIMITS.excerpt} caracteres).` };
  if (body.length > MANUAL_NEWS_LIMITS.body) return { ok: false, error: `Corpo demasiado longo (máx. ${MANUAL_NEWS_LIMITS.body} caracteres).` };

  if (!excerpt) excerpt = excerptFromBody(body);
  return { ok: true, data: { title, excerpt, body } };
}

type Db = Awaited<ReturnType<typeof createAdminClient>>;

async function uniqueSlug(db: Db, base: string): Promise<string> {
  const root = base || "noticia";
  const { data } = await db.from("news").select("slug").like("slug", `${root}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

/** Capa com a primeira foto real do jogo, se existir (sem IA). */
async function applyGamePhotoCover(db: Db, newsId: string, gameId: string): Promise<boolean> {
  try {
    const { data: pics } = await db
      .from("game_photos")
      .select("id, storage_path")
      .eq("game_id", gameId)
      .eq("hidden", false)
      .order("created_at", { ascending: true })
      .limit(1);
    if (!pics?.length) return false;
    const { data: pub } = db.storage.from("game-photos").getPublicUrl(pics[0].storage_path);
    await db.from("news").update({
      cover_image_url: pub.publicUrl,
      cover_photo_id: pics[0].id,
      image_source: "upload",
      image_status: "ready",
      image_error: null,
      image_error_type: null,
      image_prompt: null,
    }).eq("id", newsId);
    return true;
  } catch {
    return false;
  }
}

/** Notícia existente para pré-preencher o editor (por id ou pelo jogo). */
export async function loadManualNews(opts: { newsId?: string | null; gameId?: string | null }) {
  const db = await createAdminClient();
  let game: { id: string; home: string | null; away: string | null } | null = null;

  if (opts.gameId) {
    const { data: res } = await db
      .from("league_game_results")
      .select("home_team_name, away_team_name")
      .eq("event_id", opts.gameId)
      .maybeSingle();
    const { data: ev } = await db.from("events").select("id, title").eq("id", opts.gameId).maybeSingle();
    if (!ev) return { ok: false as const, error: "Jogo não encontrado" };
    game = { id: ev.id, home: res?.home_team_name ?? null, away: res?.away_team_name ?? null };
  }

  const q = db.from("news").select("id, title, excerpt, body, cover_image_url, game_id");
  const { data: news } = opts.newsId
    ? await q.eq("id", opts.newsId).maybeSingle()
    : opts.gameId
      ? await q.eq("game_id", opts.gameId).maybeSingle()
      : { data: null };

  if (opts.newsId && !news) return { ok: false as const, error: "Notícia não encontrada" };
  return { ok: true as const, news: news ?? null, game };
}

/**
 * Publica (cria ou actualiza) uma notícia escrita pelo admin.
 * - newsId: edita essa notícia.
 * - gameId: liga ao jogo; se o jogo já tem notícia, é substituída.
 * Imagem: se a notícia ainda não tem capa e o jogo tem fotos, usa a primeira foto real.
 */
export async function saveManualNews(input: ManualNewsInput): Promise<
  | { ok: true; newsId: string; created: boolean; hasCover: boolean; newsContext: { title: string; excerpt: string; homeTeamName: string | null; awayTeamName: string | null; scoreStr: string; jornadaInfo: string } }
  | { ok: false; error: string; status?: number }
> {
  const v = validateManualNews(input);
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  const { title, excerpt, body } = v.data;

  const db = await createAdminClient();

  // Dados do jogo (equipas, data, resultado) quando a notícia está ligada a um jogo
  let gameId = input.gameId || null;
  let existingId: string | null = null;
  let existingCover: string | null = null;

  if (input.newsId) {
    const { data: ex } = await db.from("news").select("id, game_id, cover_image_url").eq("id", input.newsId).maybeSingle();
    if (!ex) return { ok: false, error: "Notícia não encontrada", status: 404 };
    existingId = ex.id;
    existingCover = ex.cover_image_url;
    gameId = gameId ?? ex.game_id ?? null;
  }

  let home: string | null = null;
  let away: string | null = null;
  let eventDate: string | null = null;
  let scoreStr = "";
  let jornadaInfo = "";

  if (gameId) {
    const [{ data: ev }, { data: res }] = await Promise.all([
      db.from("events").select("id, event_date, description").eq("id", gameId).maybeSingle(),
      db.from("league_game_results").select("home_team_name, away_team_name, home_score, away_score").eq("event_id", gameId).maybeSingle(),
    ]);
    if (!ev) return { ok: false, error: "Jogo não encontrado", status: 404 };
    eventDate = ev.event_date ?? null;
    home = res?.home_team_name ?? null;
    away = res?.away_team_name ?? null;
    if (res) scoreStr = `${res.home_score}-${res.away_score}`;
    try {
      const meta = JSON.parse(ev.description ?? "{}") as { jornada?: number; volta?: number; serie?: string };
      if (meta.jornada) jornadaInfo = `Jornada ${meta.jornada}, Volta ${meta.volta ?? "?"}, Série ${meta.serie ?? "A"}`;
    } catch { /* ignore */ }

    if (!existingId) {
      const { data: ex } = await db.from("news").select("id, cover_image_url").eq("game_id", gameId).maybeSingle();
      if (ex) { existingId = ex.id; existingCover = ex.cover_image_url; }
    }
  }

  let newsId: string;
  let created = false;

  if (existingId) {
    const { error } = await db.from("news").update({
      title, excerpt, body,
      ...(gameId ? { game_id: gameId, home_team_name: home, away_team_name: away } : {}),
      is_published: true,
      updated_at: new Date().toISOString(),
    }).eq("id", existingId);
    if (error) return { ok: false, error: error.message, status: 500 };
    newsId = existingId;
  } else {
    const base = gameId && home && away && eventDate
      ? `liga-inatel-${slugify(home)}-${slugify(away)}-${eventDate.slice(0, 10)}`
      : `liga-inatel-${slugify(title).slice(0, 60).replace(/-+$/, "")}-${new Date().toISOString().slice(0, 10)}`;
    const slug = await uniqueSlug(db, base);
    const { data: ins, error } = await db.from("news").insert({
      slug, title, excerpt, body,
      category: "Liga INATEL",
      game_id: gameId,
      home_team_name: home,
      away_team_name: away,
      is_published: true,
      published_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return { ok: false, error: error.message, status: 500 };
    newsId = ins!.id;
    created = true;
  }

  let hasCover = !!existingCover;
  if (!hasCover && gameId) hasCover = await applyGamePhotoCover(db, newsId, gameId);

  return {
    ok: true, newsId, created, hasCover,
    newsContext: { title, excerpt, homeTeamName: home, awayTeamName: away, scoreStr, jornadaInfo },
  };
}
