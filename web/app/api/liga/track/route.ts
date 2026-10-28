import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/liga/track
// Regista visitas às páginas públicas da Liga INATEL (anónimos e registados).
// Público por design: não usa service role — a escrita passa pelas funções
// SECURITY DEFINER log_liga_page_view / end_liga_page_view, que validam os dados,
// limitam abusos e atribuem o user_id a partir da sessão (auth.uid()).
// Não guarda IP nem user-agent.

export const runtime = "nodejs";

const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|headless|lighthouse|vercel|monitor/i;

function deviceFromUA(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

function referrerHost(ref: unknown, ownHost: string | null): string | null {
  if (typeof ref !== "string" || !ref) return null;
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (ownHost && host === ownHost.replace(/^www\./, "")) return null; // navegação interna
    return host;
  } catch {
    return null;
  }
}

type Body =
  | { type: "view"; visitor_id?: string; session_id?: string; path?: string; referrer?: string; pwa?: boolean }
  | { type: "end"; id?: number; visitor_id?: string; duration_ms?: number };

export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return new NextResponse(null, { status: 204 });

  let body: Body;
  try {
    // sendBeacon envia text/plain — por isso lemos sempre como texto
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await createClient();

  if (body.type === "end") {
    if (typeof body.id !== "number" || typeof body.duration_ms !== "number" || !body.visitor_id) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await supabase.rpc("end_liga_page_view", {
      p_id: body.id,
      p_visitor_id: body.visitor_id,
      p_duration_ms: Math.round(body.duration_ms),
    });
    return new NextResponse(null, { status: 204 });
  }

  if (body.type !== "view" || !body.visitor_id || !body.session_id || !body.path) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("log_liga_page_view", {
    p_visitor_id: body.visitor_id,
    p_session_id: body.session_id,
    p_path: body.path.split("?")[0].slice(0, 300),
    p_referrer_host: referrerHost(body.referrer, req.headers.get("host")),
    p_device: deviceFromUA(ua),
    p_is_pwa: body.pwa === true,
    p_country: req.headers.get("x-vercel-ip-country"),
  });

  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, id: data ?? null });
}
