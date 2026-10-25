import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "game-photos";

// GET /api/liga/admin/games/[eventId]/photos
// Lista todas as fotos de um jogo com URLs públicas, nome da equipa e flag is_cover.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const admin = await createAdminClient();

  const [photosRes, newsRes] = await Promise.all([
    admin
      .from("game_photos")
      .select("id, storage_path, caption, sort_order, created_at, hidden, team_id")
      .eq("game_id", eventId)
      .order("created_at", { ascending: true }),
    admin.from("news").select("id, cover_photo_id").eq("game_id", eventId).maybeSingle(),
  ]);

  const teamIds = [...new Set((photosRes.data ?? []).map((p) => p.team_id))];
  const teamMap: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await admin.from("league_teams").select("id, name").in("id", teamIds);
    for (const t of teams ?? []) teamMap[t.id] = t.name;
  }

  const photos = (photosRes.data ?? []).map((p) => {
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(p.storage_path);
    return {
      ...p,
      public_url: pub.publicUrl,
      team_name: teamMap[p.team_id] ?? "?",
      is_cover: newsRes.data?.cover_photo_id === p.id,
    };
  });

  return NextResponse.json({ photos, news_id: newsRes.data?.id ?? null });
}

// PATCH /api/liga/admin/games/[eventId]/photos
// Body: { photo_id, action: "hide" | "unhide" | "set_cover" }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const body = await req.json().catch(() => null) as { photo_id?: string; action?: string } | null;

  if (!body?.photo_id || !body?.action) {
    return NextResponse.json({ error: "photo_id e action são obrigatórios" }, { status: 400 });
  }

  const admin = await createAdminClient();

  if (body.action === "hide" || body.action === "unhide") {
    const { error } = await admin
      .from("game_photos")
      .update({ hidden: body.action === "hide" })
      .eq("id", body.photo_id)
      .eq("game_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/liga-inatel/noticias", "layout");
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_cover") {
    const { data: photo } = await admin
      .from("game_photos")
      .select("id, storage_path")
      .eq("id", body.photo_id)
      .eq("game_id", eventId)
      .maybeSingle();
    if (!photo) return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(photo.storage_path);

    const { error } = await admin
      .from("news")
      .update({ cover_image_url: pub.publicUrl, cover_photo_id: photo.id, image_status: "ready" })
      .eq("game_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidatePath("/liga-inatel/noticias", "layout");
    return NextResponse.json({ ok: true, cover_url: pub.publicUrl });
  }

  return NextResponse.json({ error: `Ação desconhecida: ${body.action}` }, { status: 400 });
}
