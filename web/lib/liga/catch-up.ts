import { createAdminClient } from "@/lib/supabase/server";
import { publishLiveSessionToLeague } from "@/lib/liga/live-publish";
import { generateLigaNews } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";

const LOOKBACK_DAYS = 7;

export type CatchUpReport = {
  published: string[];
  news: string[];
  errors: string[];
};

/**
 * Rede de segurança (cron): jogos da Liga INATEL que ficaram a meio do circuito
 * automático nos últimos dias.
 *  1. Jogos registados ao vivo e finalizados sem resultado oficial → publica o live
 *     como resultado oficial (ex.: finalizados antes de existir a publicação automática,
 *     ou se a chamada ao finalizar falhou).
 *  2. Resultados aprovados sem notícia → gera a notícia (e a imagem em segundo plano).
 * Processa no máximo `limit` notícias por execução (tempo de execução limitado).
 */
export async function ligaCatchUp(opts: {
  limit?: number;
  schedule: (fn: () => Promise<void>) => void;
}): Promise<CatchUpReport> {
  const limit = opts.limit ?? 2;
  const db = await createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const report: CatchUpReport = { published: [], news: [], errors: [] };

  // ── 1. Live finalizado sem resultado oficial ──
  const { data: comp } = await db.from("competitions")
    .select("competition_key").eq("slug", "liga-inatel").maybeSingle();
  const leagueKey = comp?.competition_key ?? "Liga";
  const { data: sessions } = await db.from("game_sessions")
    .select("id, event_id, events!inner(id, competition, game_type, is_test, deleted_at)")
    .eq("status", "finished")
    .gte("created_at", since)
    .eq("events.competition", leagueKey)
    .eq("events.game_type", "official")
    .is("events.deleted_at", null);

  const sessionEventIds = [...new Set((sessions ?? []).map((s) => s.event_id as string))];
  if (sessionEventIds.length) {
    const { data: existing } = await db.from("league_game_results")
      .select("event_id").in("event_id", sessionEventIds);
    const done = new Set((existing ?? []).map((r) => r.event_id as string));
    const { data: admin } = await db.from("liga_admins").select("user_id").limit(1).maybeSingle();
    for (const s of sessions ?? []) {
      if (done.has(s.event_id as string)) continue;
      const actor = (admin?.user_id as string | undefined) ?? null;
      if (!actor) { report.errors.push(`sem liga_admin para auditoria (${s.event_id})`); break; }
      const res = await publishLiveSessionToLeague(s.id as string, actor);
      if (res.ok) { report.published.push(res.eventId); done.add(res.eventId); }
      else report.errors.push(`publicar ${s.id}: ${res.error}`);
    }
  }

  // ── 2. Resultados recentes sem notícia ──
  const { data: results } = await db.from("league_game_results")
    .select("event_id, approved_at")
    .not("competition_id", "is", null)
    .not("approved_at", "is", null)
    .gte("approved_at", since)
    .order("approved_at", { ascending: true });
  const ids = (results ?? []).map((r) => r.event_id as string);
  if (ids.length) {
    const { data: withNews } = await db.from("news").select("game_id").in("game_id", ids);
    const hasNews = new Set((withNews ?? []).map((n) => n.game_id as string));
    for (const gameId of ids.filter((id) => !hasNews.has(id)).slice(0, limit)) {
      const news = await generateLigaNews(gameId);
      if (!news.ok) { report.errors.push(`notícia ${gameId}: ${news.error}`); continue; }
      report.news.push(news.news_id);
      const ctx = news.newsContext;
      opts.schedule(async () => {
        const img = await generateNewsImage({ newsId: news.news_id, ...ctx });
        if (!img.ok) console.error(`[liga-catch-up] imagem falhou news_id=${news.news_id}: ${img.errorType}`);
      });
    }
  }

  return report;
}
