/**
 * Comprime uma imagem no browser usando canvas.
 * Reduz para largura máxima de 1280px e qualidade JPEG 0.75.
 * Resultado típico: 100–300 KB, ideal para mobile.
 */
export async function compressImage(
  file: File,
  maxWidth = 1280,
  quality  = 0.75,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const scale  = img.width > maxWidth ? maxWidth / img.width : 1;
      const w      = Math.round(img.width  * scale);
      const h      = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Compression failed")),
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

/** Formata bytes para leitura humana (ex: "145 KB") */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
