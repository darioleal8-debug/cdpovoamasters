import { heicToJpeg, isHeic } from "@/lib/game-sheet/client-image";

// Comprime fotos de jogo: lado maior ≤ 1920 px, JPEG 0.8, remove EXIF via canvas
export async function compressGamePhoto(file: File): Promise<File> {
  const MAX_PX = 1920;
  return new Promise<File>((resolve, reject) => {
    createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
      let { width, height } = bitmap;
      const scale = Math.min(1, MAX_PX / Math.max(width, height));
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.8);
    }).catch(reject);
  });
}

const RASTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** HEIC → JPEG e compressão, pronto para enviar para /game-photos. */
export async function prepareGamePhoto(raw: File): Promise<File> {
  let file = raw;
  if (isHeic(raw)) file = await heicToJpeg(raw);
  if (RASTER_TYPES.includes(file.type)) file = await compressGamePhoto(file);
  return file;
}
