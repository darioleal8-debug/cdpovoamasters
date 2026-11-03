/**
 * Rota de teste para a imagem da notícia — só admin da liga.
 *
 * GET /api/liga/admin/test-news-image?home=GD%20André%20Soares&away=CBF%20Felgueiras%20BAD&moment=0
 *
 * Gera via fal.ai uma foto de ação de um jogo de basquetebol com as cores reais
 * das duas equipas (sem placard/overlay) e devolve o WebP diretamente no browser.
 * O prompt usado vai no header X-Image-Prompt. `moment` (0–4) escolhe o lance.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTestGamePhoto } from "@/lib/liga/generate-image";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_liga_admin");
  if (!isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const home = searchParams.get("home") ?? "GD André Soares";
  const away = searchParams.get("away") ?? "CBF Felgueiras BAD";
  const momentIndex = Number(searchParams.get("moment") ?? Math.floor(Math.random() * 5));
  const venue = searchParams.get("venue");

  const [homeRes, awayRes] = await Promise.all([
    supabase.from("league_teams").select("primary_color, secondary_color").ilike("name", home).maybeSingle(),
    supabase.from("league_teams").select("primary_color, secondary_color").ilike("name", away).maybeSingle(),
  ]);

  try {
    const { webp, prompt, seed } = await generateTestGamePhoto({
      homePrimary: homeRes.data?.primary_color, homeSecondary: homeRes.data?.secondary_color,
      awayPrimary: awayRes.data?.primary_color, awaySecondary: awayRes.data?.secondary_color,
      venue, momentIndex,
    });
    console.log(`[test-news-image] seed=${seed} prompt=${prompt}`);
    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": `inline; filename="test-jogo.webp"`,
        "Cache-Control": "no-store",
        "X-Image-Prompt": encodeURIComponent(prompt).slice(0, 4000),
        "X-Image-Seed": String(seed),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
