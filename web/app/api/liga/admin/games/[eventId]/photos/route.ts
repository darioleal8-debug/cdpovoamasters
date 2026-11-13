import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import {
  GAME_PHOTOS_BUCKET as BUCKET,
  deleteGamePhoto,
  getGameTeams,
  storeGamePhoto,
  syncNewsCover,
} from "@/lib/liga/game-photos";

// GET /api/liga/admin/games/[eventId]/photos
// Lista todas as fotos de um jogo com URLs públicas, nome da equipa e flag is_cover.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const admin = await createUnscopedAdminClient();

  const [photosRes, newsRes, sheetRes, gameTeams] = await Promise.all([
    admin
      .from("game_photos")
      .select("id, storage_path, caption, sort_order, created_at, hidden, team_id")
      .eq("game_id", eventId)
      .order("created_at", { ascending: true }),
    admin.from("news").select("id, cover_photo_id").eq("game_id", eventId).maybeSingle(),
    admin
      .from("result_submissions")
      .select("id, photo_url")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    getGameTeams(admin, eventId),
  ]);

  const teamIds = [...new Set((photosRes.data ?? []).map((p) => p.team_id).filter(Boolean))] as string[];
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
      team_name: p.team_id ? (teamMap[p.team_id] ?? "?") : "Liga INATEL",
      is_cover: newsRes.data?.cover_photo_id === p.id,
    };
  });

  return NextResponse.json({
    photos,
    news_id: newsRes.data?.id ?? null,
    teams: [
      gameTeams?.homeId ? { id: gameTeams.homeId, name: gameTeams.homeName ?? "Casa" } : null,
      gameTeams?.awayId ? { id: gameTeams.awayId, name: gameTeams.awayName ?? "Fora" } : null,
    ].filter(Boolean),
    sheet: sheetRes.data?.photo_url
      ? { submission_id: sheetRes.data.id, photo_url: sheetRes.data.photo_url }
      : null,
  });
}

// PATCH /api/liga/admin/games/[eventId]/photos
// Body: { photo_id, action: "hide" | "unhide" | "set_cover" | "delete" }
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

  const admin = await createUnscopedAdminClient();

  if (body.action === "hide" || body.action === "unhide") {
    const { error } = await admin
      .from("game_photos")
      .update({ hidden: body.action === "hide" })
      .eq("id", body.photo_id)
      .eq("game_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/liga-inatel/noticias", "layout");
    // Ocultar a capa → escolher outra foto (ou IA); mostrar → pode passar a ser capa
    await syncNewsCover(admin, eventId,
      body.action === "hide" ? { kind: "removed", photoId: body.photo_id } : { kind: "added" });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const { data: photo } = await admin
      .from("game_photos")
      .select("id, game_id, storage_path")
      .eq("id", body.photo_id)
      .eq("game_id", eventId)
      .maybeSingle();
    if (!photo) return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
    await deleteGamePhoto(admin, photo as { id: string; game_id: string; storage_path: string });
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
      .update({ cover_image_url: pub.publicUrl, cover_photo_id: photo.id, image_source: "upload", image_status: "ready" })
      .eq("game_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidatePath("/liga-inatel/noticias", "layout");
    return NextResponse.json({ ok: true, cover_url: pub.publicUrl });
  }

  return NextResponse.json({ error: `Ação desconhecida: ${body.action}` }, { status: 400 });
}

// POST /api/liga/admin/games/[eventId]/photos
// Admin adiciona fotos a qualquer momento (antes ou depois do resultado confirmado).
// FormData: photo, caption?, team_id? (uma das equipas do jogo; vazio = "Liga INATEL")
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "FormData inválido" }, { status: 400 });

  const photo   = form.get("photo") as File | null;
  const caption = ((form.get("caption") as string | null) ?? "").slice(0, 120).trim() || null;
  const teamRaw = ((form.get("team_id") as string | null) ?? "").trim() || null;
  if (!photo) return NextResponse.json({ error: "photo é obrigatório" }, { status: 400 });

  const admin = await createUnscopedAdminClient();
  const teams = await getGameTeams(admin, eventId);
  if (!teams) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  if (teamRaw && teamRaw !== teams.homeId && teamRaw !== teams.awayId) {
    return NextResponse.json({ error: "Equipa não pertence a este jogo" }, { status: 400 });
  }

  const stored = await storeGamePhoto(admin, { gameId: eventId, teamId: teamRaw, photo, caption, userId: auth.user.id });
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  await syncNewsCover(admin, eventId, { kind: "added" });
  return NextResponse.json({ id: stored.id, public_url: stored.public_url });
}
