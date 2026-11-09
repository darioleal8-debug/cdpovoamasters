import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/game-sheet/service";

export const runtime = "nodejs";

/** Publicar (ou voltar a rascunho) uma notícia — usado para validar notícias em rascunho. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Notícia inválida" }, { status: 400 });
  let body: { is_published?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (typeof body.is_published !== "boolean") return NextResponse.json({ error: "is_published obrigatório" }, { status: 400 });

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("news")
    .update({ is_published: body.is_published, ...(body.is_published ? { published_at: new Date().toISOString() } : {}) })
    .eq("id", id)
    .select("id, is_published, game_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });
  console.info(`[news/publish] news=${id} is_published=${body.is_published} by=${auth.user.id}`);
  revalidatePath("/liga-inatel", "layout");
  return NextResponse.json({ ok: true, is_published: data.is_published });
}
