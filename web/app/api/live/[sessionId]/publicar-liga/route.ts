import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/guards";
import { MANAGERS } from "@/lib/auth/roles";
import { publishLiveSessionToLeague } from "@/lib/liga/live-publish";
import { generateLigaNews } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Depois de finalizada a estatística live, assume-a como resultado oficial da
 * Liga INATEL (resultado, parciais, pontos por jogador → classificação) e gera
 * a notícia do jogo com essas estatísticas. Chamado automaticamente ao
 * finalizar o jogo no live; pode ser repetido (idempotente).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;

  const { sessionId } = await params;
  const res = await publishLiveSessionToLeague(sessionId, auth.user.id);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });

  revalidatePath("/liga-inatel", "layout");
  revalidatePath("/noticias", "layout");

  if (!res.isTest) {
    const eventId = res.eventId;
    after(async () => {
      const news = await generateLigaNews(eventId);
      if (!news.ok) {
        console.error(`[live/publicar-liga] generateLigaNews falhou game_id=${eventId}: ${news.error}`);
        return;
      }
      const img = await generateNewsImage({ newsId: news.news_id, ...news.newsContext });
      if (!img.ok) console.error(`[live/publicar-liga] generateNewsImage falhou news_id=${news.news_id}: ${img.errorType}`);
    });
  }

  return NextResponse.json(res);
}
