import sharp from "sharp";
import { createHash } from "node:crypto";

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // igual ao bucket folhas-jogo

/** Deteta o tipo REAL pelo conteúdo (magic bytes), ignorando o Content-Type do cliente. */
export function sniffImageMime(buf: Buffer): AcceptedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Lado maior máximo enviado ao modelo: preserva texto pequeno sem enviar imagens gigantes. */
const MAX_SIDE = 3000;

export interface PreparedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Pré-processamento não destrutivo para leitura de documentos:
 *  - corrige a orientação EXIF
 *  - limita o lado maior a 3000 px (só reduz, nunca amplia a imagem completa)
 *  - normalização moderada de contraste e nitidez
 * Valida também que o ficheiro é uma imagem descodificável (proteção contra ficheiros malformados).
 */
export async function prepareForVision(input: Buffer): Promise<PreparedImage> {
  const img = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const { data, info } = await img
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .normalise({ lower: 1, upper: 99 })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

export interface Region { x: number; y: number; w: number; h: number }

/**
 * Recorta a união das regiões duvidosas (coordenadas normalizadas 0–1), com margem,
 * e amplia ×2 para a segunda leitura.
 */
export async function cropRegions(prepared: PreparedImage, regions: Region[]): Promise<Buffer | null> {
  if (regions.length === 0) return null;
  const pad = 0.04;
  const x0 = Math.max(0, Math.min(...regions.map((r) => r.x)) - pad);
  const y0 = Math.max(0, Math.min(...regions.map((r) => r.y)) - pad);
  const x1 = Math.min(1, Math.max(...regions.map((r) => r.x + r.w)) + pad);
  const y1 = Math.min(1, Math.max(...regions.map((r) => r.y + r.h)) + pad);
  const left = Math.floor(x0 * prepared.width);
  const top = Math.floor(y0 * prepared.height);
  const width = Math.max(1, Math.floor((x1 - x0) * prepared.width));
  const height = Math.max(1, Math.floor((y1 - y0) * prepared.height));
  // Recorte que cobre quase toda a imagem não traz ganho — evita custo extra
  if (width * height > prepared.width * prepared.height * 0.6) return null;
  const scale = Math.min(2, 2400 / Math.max(width, height));
  return sharp(prepared.buffer)
    .extract({ left, top, width, height })
    .resize({ width: Math.round(width * scale), height: Math.round(height * scale), kernel: "lanczos3" })
    .sharpen({ sigma: 1 })
    .jpeg({ quality: 92 })
    .toBuffer();
}
