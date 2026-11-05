import { after, NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { generateNewsImage } from "@/lib/liga/generate-image";
import { ligaCatchUp, type CatchUpReport } from "@/lib/liga/catch-up";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // 1. Jogos da liga a meio do circuito: live por publicar / resultado sem notícia
  let catchUp: CatchUpReport | null = null;
  try {
    catchUp = await ligaCatchUp({ limit: 2, schedule: (fn) => after(fn) });
    if (catchUp.published.length || catchUp.news.length) {
      revalidatePath("/liga-inatel", "layout");
      revalidatePath("/noticias", "layout");
    }
    if (catchUp.errors.length) console.error("[cron/retry-news-images] catch-up:", catchUp.errors);
  } catch (e) {
    console.error("[cron/retry-news-images] catch-up falhou", e);
  }

  // 2. Imagens de notícias que falharam
  const admin = await createAdminClient();

  const { data: articles } = await admin
    .from("news")
    .select("id, title, excerpt, home_team_name, away_team_name")
    .eq("category", "Liga INATEL")
    .eq("is_published", true)
    .is("cover_image_url", null)
    .in("image_status", ["failed", "fallback"])
    .order("published_at", { ascending: true })
    .limit(3);

  if (!articles?.length) {
    return NextResponse.json({ ok: true, retried: 0, catchUp });
  }

  let retried = 0;
  let stopped = false;

  for (const article of articles) {
    await admin
      .from("news")
      .update({ image_status: "pending", image_error: null, image_error_type: null })
      .eq("id", article.id);

    const result = await generateNewsImage({
      newsId: article.id,
      title: article.title,
      excerpt: article.excerpt,
      homeTeamName: article.home_team_name,
      awayTeamName: article.away_team_name,
    });

    retried++;

    if (!result.ok && (result.errorType === "BILLING" || result.errorType === "AUTH")) {
      console.error(`[cron/retry-news-images] parando em ${result.errorType} após ${article.id}`);
      stopped = true;
      break;
    }
  }

  return NextResponse.json({ ok: true, retried, stopped, catchUp });
}
