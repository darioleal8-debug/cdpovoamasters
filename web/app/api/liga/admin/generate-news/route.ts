import { NextResponse } from "next/server";
import { after } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { generateLigaNews, getDefaultNewsPrompts } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const maxDuration = 60;

const MAX_PROMPT_CHARS = 12_000;

// GET /api/liga/admin/generate-news?game_id=…
// Devolve os prompts que seriam usados por defeito (para o admin os editar).
export async function GET(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const gameId = new URL(req.url).searchParams.get("game_id");
  if (!gameId) return NextResponse.json({ error: "game_id obrigatório" }, { status: 400 });

  const prompts = await getDefaultNewsPrompts(gameId);
  if (!prompts.ok) return NextResponse.json({ error: prompts.error }, { status: 404 });
  return NextResponse.json({ system: prompts.system, user: prompts.user, format: prompts.format });
}

// POST /api/liga/admin/generate-news
// Gera (ou regenera) a notícia de um jogo aprovado. Idempotente.
// Opcionalmente o admin envia o seu próprio prompt (system_prompt = instruções editoriais,
// user_prompt = pedido completo com factos). O formato JSON de resposta é sempre acrescentado.
// A imagem é gerada em segundo plano via after().
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { game_id?: string; system_prompt?: unknown; user_prompt?: unknown };
  if (!body.game_id) return NextResponse.json({ error: "game_id obrigatório" }, { status: 400 });

  const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
  const systemPrompt = text(body.system_prompt);
  const userPrompt = text(body.user_prompt);
  if ((systemPrompt?.length ?? 0) > MAX_PROMPT_CHARS || (userPrompt?.length ?? 0) > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `Prompt demasiado longo (máx. ${MAX_PROMPT_CHARS} caracteres)` }, { status: 400 });
  }

  const result = await generateLigaNews(body.game_id, { systemPrompt, userPrompt });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const { news_id, newsContext } = result;
  after(async () => {
    await generateNewsImage({ newsId: news_id, ...newsContext });
  });

  return NextResponse.json({ ok: true, news_id });
}
