/**
 * Utilitários de compressão de imagem no browser (lado do cliente).
 * Não importar em código server-side — usa canvas/createImageBitmap.
 */

const HEIC_TYPES = ["image/heic", "image/heif"] as const;

export function isHeic(file: File): boolean {
  return (
    HEIC_TYPES.includes(file.type as (typeof HEIC_TYPES)[number]) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

/** Converte HEIC/HEIF para JPEG no browser via heic2any. */
export async function heicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

/**
 * Normaliza SEMPRE a imagem: corrige orientação EXIF, limita o lado maior a
 * maxPx (preserva o texto manuscrito pequeno) e exporta como JPEG com a
 * qualidade especificada.
 */
export async function normalizeImage(file: File, maxPx = 3200, quality = 0.92): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
      let { width, height } = bitmap;
      const scale = Math.min(1, maxPx / Math.max(width, height));
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    }).catch(reject);
  });
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB — margem abaixo do limite 4,5 MB da Vercel
const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB para PDFs (convertidos pelo microserviço OpenCV)

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Prepara uma folha de jogo para upload:
 *  - PDF: valida tamanho (máx. 10 MB) e envia diretamente (conversão feita pelo microserviço OpenCV).
 *  - Imagem:
 *    1. HEIC/HEIF → JPEG
 *    2. normalizeImage (3200 px, JPEG 0.92)
 *    3. Se > 4 MB: reduz qualidade (0.85 → 0.78 → 0.7) e, se necessário, 2560 px
 *
 * Não comprime abaixo de 2560 px nem qualidade 0.7 (texto manuscrito pequeno).
 * Devolve null se mesmo assim não couber.
 */
export async function prepareSheetForUpload(
  raw: File,
): Promise<{ file: File; warning?: string } | { error: string }> {
  if (isPdfFile(raw)) {
    if (raw.size === 0) return { error: "O PDF está vazio." };
    if (raw.size > MAX_PDF_UPLOAD_BYTES) {
      return { error: `PDF demasiado grande (máx. ${MAX_PDF_UPLOAD_BYTES / 1024 / 1024} MB). Reduza o tamanho antes de enviar.` };
    }
    return { file: raw };
  }

  let file: File = raw;

  if (isHeic(file)) {
    try {
      file = await heicToJpeg(file);
    } catch {
      return { error: "Não foi possível converter o ficheiro HEIC. Tire uma foto JPEG ou PNG." };
    }
  }

  // Passo 1: compressão inicial (3200 px, 0.92)
  file = await normalizeImage(file, 3200, 0.92);
  if (file.size <= MAX_UPLOAD_BYTES) return { file };

  // Passo 2: reduzir qualidade mantendo 3200 px
  for (const q of [0.85, 0.78, 0.7] as const) {
    file = await normalizeImage(file, 3200, q);
    if (file.size <= MAX_UPLOAD_BYTES) return { file };
  }

  // Passo 3: reduzir para 2560 px com qualidade 0.7
  file = await normalizeImage(file, 2560, 0.7);
  if (file.size <= MAX_UPLOAD_BYTES) return { file, warning: "Imagem reduzida para caber no limite de 4 MB." };

  return { error: "Imagem demasiado grande (máx. 4 MB após compressão). Tire a foto com menos resolução ou recorte a folha." };
}
