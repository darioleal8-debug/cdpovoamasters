import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

// GET  /api/public/news-engagement?news_id=…&visitor_id=…  → { views, likes, dislikes, my_vote }
// POST /api/public/news-engagement  { action: "view" | "vote", news_id, visitor_id, vote? }
//
// Público por design (visitantes anónimos): usa o cliente anónimo e as funções
// SECURITY DEFINER get_news_engagement / register_news_view / vote_news (migração 146),
// que validam os dados, só aceitam notícias publicadas e limitam abusos.
// Não guarda IP nem user-agent.

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR_RE = /^[A-Za-z0-9-]{8,64}$/;
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|headless|lighthouse|vercel|monitor/i;
const NO_STORE = { "Cache-Control": "no-store" };

function bad() {
  return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const newsId = searchParams.get("news_id") ?? "";
  const visitorId = searchParams.get("visitor_id");
  if (!UUID_RE.test(newsId)) return bad();

  const { data, error } = await createPublicClient().rpc("get_news_engagement", {
    p_news_id: newsId,
    p_visitor_id: visitorId && VISITOR_RE.test(visitorId) ? visitorId : null,
  });
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  let body: { action?: string; news_id?: string; visitor_id?: string; vote?: number };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return bad();
  }
  if (!body.news_id || !UUID_RE.test(body.news_id)) return bad();
  if (!body.visitor_id || !VISITOR_RE.test(body.visitor_id)) return bad();

  const supabase = createPublicClient();
  let result;

  if (body.action === "view") {
    const ua = req.headers.get("user-agent") ?? "";
    // Bots e pré-visualizações de links não contam como visualização: só leem o estado
    result =
      !ua || BOT_RE.test(ua)
        ? await supabase.rpc("get_news_engagement", { p_news_id: body.news_id, p_visitor_id: body.visitor_id })
        : await supabase.rpc("register_news_view", { p_news_id: body.news_id, p_visitor_id: body.visitor_id });
  } else if (body.action === "vote") {
    if (body.vote !== 1 && body.vote !== -1 && body.vote !== 0) return bad();
    result = await supabase.rpc("vote_news", {
      p_news_id: body.news_id,
      p_visitor_id: body.visitor_id,
      p_vote: body.vote,
    });
  } else {
    return bad();
  }

  if (result.error || !result.data) {
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, ...result.data }, { headers: NO_STORE });
}
