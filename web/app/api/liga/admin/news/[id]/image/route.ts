import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "noticias";
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// PATCH /api/liga/admin/news/[id]/image — faz upload da imagem de destaque
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = await createAdminClient();

  // Verificar que a notícia existe e é Liga INATEL
  const { data: article } = await admin
    .from("news")
    .select("id, slug, cover_image_url")
    .eq("id", id)
    .eq("category", "Liga INATEL")
    .single();

  if (!article) {
    return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "Campo 'image' em falta" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo não permitido (JPEG, PNG ou WebP)" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 5 MB)" }, { status: 400 });
  }

  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
  const coverImageUrl = publicData.publicUrl;

  const { error: updateErr } = await admin
    .from("news")
    .update({ cover_image_url: coverImageUrl })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  revalidatePath(`/noticias/${article.slug}`);
  revalidatePath("/liga-inatel", "layout");
  revalidatePath("/noticias", "layout");

  return NextResponse.json({ ok: true, cover_image_url: coverImageUrl });
}

// DELETE /api/liga/admin/news/[id]/image — remove a imagem de destaque
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = await createAdminClient();

  const { data: article } = await admin
    .from("news")
    .select("id, slug, cover_image_url")
    .eq("id", id)
    .eq("category", "Liga INATEL")
    .single();

  if (!article) {
    return NextResponse.json({ error: "Notícia não encontrada" }, { status: 404 });
  }

  // Tentar apagar o ficheiro no storage (best effort)
  if (article.cover_image_url) {
    const url = new URL(article.cover_image_url);
    const segments = url.pathname.split("/");
    const bucketIdx = segments.findIndex(s => s === BUCKET);
    if (bucketIdx !== -1) {
      const filePath = segments.slice(bucketIdx + 1).join("/");
      await admin.storage.from(BUCKET).remove([filePath]);
    }
  }

  await admin.from("news").update({ cover_image_url: null }).eq("id", id);

  revalidatePath(`/noticias/${article.slug}`);
  revalidatePath("/liga-inatel", "layout");
  revalidatePath("/noticias", "layout");

  return NextResponse.json({ ok: true });
}
