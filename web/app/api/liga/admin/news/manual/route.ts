import { NextResponse, after } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { loadManualNews, saveManualNews } from "@/lib/liga/manual-news";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const maxDuration = 60;

// GET /api/liga/admin/news/manual?news_id=… | ?game_id=…
// Conteúdo actual (se existir) para pré-preencher o editor manual.
export async function GET(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const res = await loadManualNews({ newsId: sp.get("news_id"), gameId: sp.get("game_id") });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 });
  return NextResponse.json({ news: res.news, game: res.game });
}

// POST /api/liga/admin/news/manual
// Publica uma notícia escrita pelo admin (sem DeepSeek). Body:
// { news_id?, game_id?, title, excerpt?, body, generate_image? }
// generate_image: só quando a notícia fica sem capa (sem foto do jogo), gera imagem por IA em segundo plano.
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Pedido inválido" }, { status: 400 }); }

  const id = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const result = await saveManualNews({
    newsId: id(body.news_id),
    gameId: id(body.game_id),
    title: typeof body.title === "string" ? body.title : "",
    excerpt: typeof body.excerpt === "string" ? body.excerpt : "",
    body: typeof body.body === "string" ? body.body : "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  const wantsImage = body.generate_image === true && !result.hasCover;
  if (wantsImage) {
    const { newsId, newsContext } = result;
    after(async () => {
      await generateNewsImage({ newsId, ...newsContext });
    });
  }

  return NextResponse.json({
    ok: true,
    news_id: result.newsId,
    created: result.created,
    has_cover: result.hasCover,
    image_queued: wantsImage,
  });
}
