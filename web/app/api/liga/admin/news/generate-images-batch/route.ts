import { NextResponse } from "next/server";
import { after } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const maxDuration = 300;

// POST /api/liga/admin/news/generate-images-batch
// Body opcional: { force: true } — regenera TODAS (incluindo as que já têm imagem).
// Sem force: só as que não têm imagem ou falharam.
// Para imediatamente em erro BILLING/AUTH; marca restantes como failed.
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { force?: boolean };
  const force = body.force === true;

  const admin = await createUnscopedAdminClient();
  let query = admin
    .from("news")
    .select("id, title, excerpt, home_team_name, away_team_name")
    .eq("category", "Liga INATEL")
    .eq("is_published", true)
    .not("image_status", "eq", "pending")
    .order("published_at", { ascending: true })
    .limit(force ? 50 : 15);

  if (!force) {
    // Sem force: apenas artigos sem imagem ou com erro
    query = query.or("cover_image_url.is.null,image_status.eq.failed");
  }

  const { data: articles } = await query;

  if (!articles?.length) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  // Limpa erros anteriores e marca todas como pendentes antes de devolver resposta
  await admin
    .from("news")
    .update({ image_status: "pending", image_error: null, image_error_type: null })
    .in("id", articles.map((a) => a.id));

  after(async () => {
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const result = await generateNewsImage({
        newsId: article.id,
        title: article.title,
        excerpt: article.excerpt,
        homeTeamName: article.home_team_name,
        awayTeamName: article.away_team_name,
      });

      // Erro de conta: para e marca restantes como failed para não ficarem presos em pending
      if (!result.ok && (result.errorType === "BILLING" || result.errorType === "AUTH")) {
        console.error(`[generateImages/batch] parando em ${result.errorType} após artigo ${article.id}`);
        const remaining = articles.slice(i + 1);
        if (remaining.length > 0) {
          const batchAdmin = await createUnscopedAdminClient();
          await batchAdmin
            .from("news")
            .update({
              image_status: "failed",
              image_error_type: result.errorType,
              image_error: "Interrompido: erro na conta fal.ai",
            })
            .in("id", remaining.map((a) => a.id));
        }
        break;
      }

      // Pausa entre pedidos para não sobrecarregar as APIs externas
      if (i < articles.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  });

  return NextResponse.json({ ok: true, count: articles.length });
}
