import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { MAX_PLAYER_PHOTO_BYTES, PLAYER_PHOTOS_BUCKET } from "@/lib/liga/roster";
import { sniffImageMime } from "@/lib/game-sheet/image";

/** Fotografia do jogador: valida, recorta ao centro (quadrado 640 px), WebP, e grava na pasta da equipa. */
export async function storePlayerPhoto(db: SupabaseClient, teamId: string, file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (file.size === 0 || file.size > MAX_PLAYER_PHOTO_BYTES) return { ok: false, error: "Fotografia em falta ou demasiado grande (máx. 5 MB)" };
  const input = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(input);
  if (!mime || mime === "application/pdf") return { ok: false, error: "Formato de fotografia não suportado (use JPEG, PNG ou WebP)" };
  let out: Buffer;
  try {
    out = await sharp(input, { failOn: "error", limitInputPixels: 60_000_000 }).rotate()
      .resize(640, 640, { fit: "cover", position: "attention" }).webp({ quality: 82 }).toBuffer();
  } catch {
    return { ok: false, error: "Não foi possível ler a fotografia" };
  }
  const path = `${teamId}/${randomUUID()}.webp`;
  const { error } = await db.storage.from(PLAYER_PHOTOS_BUCKET).upload(path, out, { contentType: "image/webp", upsert: false });
  if (error) return { ok: false, error: `Erro ao guardar a fotografia: ${error.message}` };
  return { ok: true, path };
}

export async function removePlayerPhoto(db: SupabaseClient, path: string | null): Promise<void> {
  if (!path) return;
  await db.storage.from(PLAYER_PHOTOS_BUCKET).remove([path]).catch(() => undefined);
}
