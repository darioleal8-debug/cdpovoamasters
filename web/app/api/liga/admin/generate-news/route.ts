import { NextResponse } from "next/server";
import { after } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { generateLigaNews } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const maxDuration = 60;

// POST /api/liga/admin/generate-news
// Gera (ou regenera) a notícia de um jogo aprovado. Idempotente.
// A imagem é gerada em segundo plano via after().
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { game_id } = (await req.json()) as { game_id: string };
  if (!game_id) return NextResponse.json({ error: "game_id obrigatório" }, { status: 400 });

  const result = await generateLigaNews(game_id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const { news_id, newsContext } = result;
  after(async () => {
    await generateNewsImage({ newsId: news_id, ...newsContext });
  });

  return NextResponse.json({ ok: true, news_id });
}
