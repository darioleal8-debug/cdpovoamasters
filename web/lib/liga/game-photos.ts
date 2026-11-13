import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { createUnscopedAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";
import { generateNewsImage } from "@/lib/liga/generate-image";

type AdminClient = Awaited<ReturnType<typeof createUnscopedAdminClient>>;

export const GAME_PHOTOS_BUCKET = "game-photos";
export const GAME_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const GAME_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PHOTOS_PER_TEAM = 10;

export type GameTeams = { homeId: string | null; awayId: string | null; homeName: string | null; awayName: string | null };

/** Equipas (ids da liga) de um jogo: pelo resultado, se existir, senão pelos nomes no meta do evento. */
export async function getGameTeams(admin: AdminClient, gameId: string): Promise<GameTeams | null> {
  const { data: event } = await admin
    .from("events")
    .select("id, description")
    .eq("id", gameId)
    .eq("type", "jogo")
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return null;

  const meta = parseGameMeta(event.description ?? null);
  const { data: result } = await admin
    .from("league_game_results")
    .select("home_team_id, away_team_id, home_team_name, away_team_name")
    .eq("event_id", gameId)
    .maybeSingle();

  const homeName = (result?.home_team_name as string | null) ?? meta?.home_team ?? null;
  const awayName = (result?.away_team_name as string | null) ?? meta?.away_team ?? null;
  let homeId = (result?.home_team_id as string | null) ?? null;
  let awayId = (result?.away_team_id as string | null) ?? null;

  const missing = [!homeId ? homeName : null, !awayId ? awayName : null].filter(Boolean) as string[];
  if (missing.length > 0) {
    const { data: teams } = await admin.from("league_teams").select("id, name").in("name", missing);
    if (!homeId && homeName) homeId = teams?.find((t) => t.name === homeName)?.id ?? null;
    if (!awayId && awayName) awayId = teams?.find((t) => t.name === awayName)?.id ?? null;
  }

  return { homeId, awayId, homeName, awayName };
}

/** Valida e guarda uma foto (storage + linha em game_photos). */
export async function storeGamePhoto(
  admin: AdminClient,
  opts: { gameId: string; teamId: string | null; photo: File; caption: string | null; userId: string },
): Promise<{ ok: true; id: string; public_url: string; storage_path: string } | { ok: false; status: number; error: string }> {
  const { gameId, teamId, photo, caption, userId } = opts;

  if (!GAME_PHOTO_TYPES.includes(photo.type)) {
    return { ok: false, status: 400, error: "Tipo não suportado. Usa JPEG, PNG ou WEBP." };
  }
  if (photo.size > GAME_PHOTO_MAX_BYTES) {
    return { ok: false, status: 400, error: "Ficheiro demasiado grande (máx. 10 MB)" };
  }

  if (teamId) {
    const { count } = await admin
      .from("game_photos")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("team_id", teamId);
    if ((count ?? 0) >= MAX_PHOTOS_PER_TEAM) {
      return { ok: false, status: 409, error: `Limite de ${MAX_PHOTOS_PER_TEAM} fotografias por equipa atingido` };
    }
  }

  const ext = photo.type === "image/webp" ? "webp" : photo.type === "image/png" ? "png" : "jpg";
  const storagePath = `${gameId}/${teamId ?? "liga"}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await photo.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(GAME_PHOTOS_BUCKET)
    .upload(storagePath, buffer, { contentType: photo.type, upsert: false, cacheControl: "31536000" });
  if (uploadErr) {
    console.error(`[game-photos] upload: ${uploadErr.message}`);
    return { ok: false, status: 500, error: "Erro no upload" };
  }

  const { data: inserted, error: dbErr } = await admin
    .from("game_photos")
    .insert({ game_id: gameId, team_id: teamId, storage_path: storagePath, caption, uploaded_by: userId })
    .select("id")
    .single();
  if (dbErr || !inserted) {
    await admin.storage.from(GAME_PHOTOS_BUCKET).remove([storagePath]);
    console.error(`[game-photos] insert: ${dbErr?.message}`);
    const limit = dbErr?.message?.includes("max_photos_exceeded");
    return { ok: false, status: limit ? 409 : 500, error: limit ? `Limite de ${MAX_PHOTOS_PER_TEAM} fotografias por equipa atingido` : "Erro ao guardar a foto" };
  }

  const { data: pub } = admin.storage.from(GAME_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return { ok: true, id: inserted.id as string, public_url: pub.publicUrl, storage_path: storagePath };
}

/**
 * Mantém a capa da notícia do jogo coerente com as fotos:
 *  • "added": se a notícia ainda não tem foto real como capa (imagem IA ou nenhuma),
 *    passa a usar a primeira foto visível do jogo, tal e qual a original.
 *  • "removed": se a foto removida/ocultada era a capa, escolhe a próxima foto visível;
 *    sem fotos, volta a gerar a imagem por IA.
 * Usa generateNewsImage (passo 0 = foto real) em background, após a resposta.
 */
export async function syncNewsCover(
  admin: AdminClient,
  gameId: string,
  change: { kind: "added" } | { kind: "removed"; photoId: string; wasCoverPhotoId?: string | null },
) {
  const { data: news } = await admin
    .from("news")
    .select("id, title, excerpt, home_team_name, away_team_name, cover_photo_id")
    .eq("game_id", gameId)
    .maybeSingle();

  revalidateGamePhotoPaths(gameId);
  if (!news) return;

  const coverId = change.kind === "removed" && change.wasCoverPhotoId !== undefined
    ? change.wasCoverPhotoId
    : (news.cover_photo_id as string | null);

  const needsSync = change.kind === "added" ? !coverId : coverId === change.photoId;
  if (!needsSync) return;

  after(async () => {
    try {
      await generateNewsImage({
        newsId: news.id as string,
        title: news.title as string,
        excerpt: (news.excerpt as string | null) ?? "",
        homeTeamName: news.home_team_name as string | null,
        awayTeamName: news.away_team_name as string | null,
      });
    } catch (e) {
      console.error(`[game-photos] syncNewsCover: ${(e as Error).message}`);
    }
    revalidateGamePhotoPaths(gameId);
  });
}

export function revalidateGamePhotoPaths(gameId: string) {
  try {
    revalidatePath(`/liga-inatel/jogo/${gameId}`);
    revalidatePath("/liga-inatel/noticias", "layout");
    revalidatePath("/liga-inatel");
  } catch { /* fora de um request — ignorar */ }
}

/** Remove uma foto (storage + linha) e ajusta a capa da notícia se necessário. */
export async function deleteGamePhoto(admin: AdminClient, photo: { id: string; game_id: string; storage_path: string }) {
  // Ler a capa antes de apagar (a FK põe cover_photo_id a NULL)
  const { data: news } = await admin.from("news").select("cover_photo_id").eq("game_id", photo.game_id).maybeSingle();
  await admin.storage.from(GAME_PHOTOS_BUCKET).remove([photo.storage_path]);
  await admin.from("game_photos").delete().eq("id", photo.id);
  await syncNewsCover(admin, photo.game_id, {
    kind: "removed",
    photoId: photo.id,
    wasCoverPhotoId: (news?.cover_photo_id as string | null) ?? null,
  });
}
