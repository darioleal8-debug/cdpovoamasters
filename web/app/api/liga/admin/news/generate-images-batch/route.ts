import { NextResponse } from "next/server";
import { after } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const maxDuration = 300;

// POST /api/liga/admin/news/generate-images-batch
// Gera imagens para todas as notícias publicadas sem imagem.
// Processa uma de cada vez em segundo plano (after).
export async function POST() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const admin = await createAdminClient();
  const { data: articles } = await admin
    .from("news")
    .select("id, title, excerpt, home_team_name, away_team_name")
    .eq("category", "Liga INATEL")
    .eq("is_published", true)
    .is("cover_image_url", null)
    .not("image_status", "eq", "pending")
    .order("published_at", { ascending: true })
    .limit(15);

  if (!articles?.length) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  // Marca todas como pendentes antes de devolver resposta
  await admin
    .from("news")
    .update({ image_status: "pending" })
    .in("id", articles.map((a) => a.id));

  after(async () => {
    for (const article of articles) {
      await generateNewsImage({
        newsId: article.id,
        title: article.title,
        excerpt: article.excerpt,
        homeTeamName: article.home_team_name,
        awayTeamName: article.away_team_name,
      });
      // Pequena pausa entre pedidos para não sobrecarregar as APIs externas
      await new Promise((r) => setTimeout(r, 1500));
    }
  });

  return NextResponse.json({ ok: true, count: articles.length });
}
