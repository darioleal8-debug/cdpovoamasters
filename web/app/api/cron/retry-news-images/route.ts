import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

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
    return NextResponse.json({ ok: true, retried: 0 });
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

  return NextResponse.json({ ok: true, retried, stopped });
}
