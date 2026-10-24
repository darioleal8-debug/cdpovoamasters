import { NextResponse } from "next/server";
import { after } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { generateNewsImage, generateNewsImageFromPrompt } from "@/lib/liga/generate-image";

export const maxDuration = 120;

// POST /api/liga/admin/news/[id]/generate-image
// Enfileira geração de imagem IA para uma notícia. A imagem é gerada via after().
// Body (opcional): { custom_prompt: string } — se fornecido, salta o DeepSeek.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { custom_prompt?: string };
  const customPrompt = body.custom_prompt?.trim() || null;

  const admin = await createAdminClient();
  const { data: article } = await admin
    .from("news")
    .select("id, title, excerpt, home_team_name, away_team_name")
    .eq("id", id)
    .eq("category", "Liga INATEL")
    .single();

  if (!article) {
    return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });
  }

  // Marca como pendente antes de devolver resposta
  await admin.from("news").update({ image_status: "pending" }).eq("id", id);

  if (customPrompt) {
    after(async () => {
      await generateNewsImageFromPrompt(id, customPrompt);
    });
  } else {
    after(async () => {
      await generateNewsImage({
        newsId: id,
        title: article.title,
        excerpt: article.excerpt,
        homeTeamName: article.home_team_name,
        awayTeamName: article.away_team_name,
      });
    });
  }

  return NextResponse.json({ ok: true });
}
