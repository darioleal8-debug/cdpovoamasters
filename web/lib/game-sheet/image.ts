import sharp from "sharp";
import { createHash } from "node:crypto";

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;  // limite Vercel Hobby (~4,5 MB)
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // igual ao bucket folhas-jogo
export const MAX_PDF_BYTES = 10 * 1024 * 1024;    // PDFs podem ser maiores; convertidos antes do upload

/** Deteta o tipo REAL pelo conteúdo (magic bytes), ignorando o Content-Type do cliente. */
export function sniffImageMime(buf: Buffer): AcceptedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  return null;
}

export function isPdf(mime: AcceptedMime | null): mime is "application/pdf" {
  return mime === "application/pdf";
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

export type ZoneMap = Record<string, Region>;

export interface OpencvResult {
  /** Imagem pré-processada (perspetiva corrigida + CLAHE) */
  buffer: Buffer;
  perspectiveApplied: boolean;
  quality: {
    sharpness: number;
    brightness: number;
    isBlurry: boolean;
    issues: string[];
    legibility: number;
  };
  zones: ZoneMap;
}

/**
 * Chama o microserviço OpenCV para pré-processar a imagem.
 * Devolve null se o serviço não estiver configurado ou falhar (fallback gracioso).
 *
 * Variáveis de ambiente:
 *   OPENCV_SERVICE_URL    — URL do serviço (ex.: https://my-service.onrender.com)
 *   OPENCV_SERVICE_SECRET — token Bearer
 */
export async function callOpencvService(
  input: Buffer,
  mime: AcceptedMime,
): Promise<OpencvResult | null> {
  const serviceUrl = process.env.OPENCV_SERVICE_URL?.replace(/\/$/, "");
  if (!serviceUrl) return null;

  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(input)], { type: mime }), "sheet");

  const headers: HeadersInit = {};
  const secret = process.env.OPENCV_SERVICE_SECRET;
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  let res: Response;
  try {
    res = await fetch(`${serviceUrl}/preprocess`, {
      method: "POST",
      headers,
      body: fd,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.warn("[opencv] serviço indisponível:", (err as Error).message);
    return null;
  }

  if (!res.ok) {
    console.warn(`[opencv] HTTP ${res.status}:`, await res.text().catch(() => ""));
    return null;
  }

  let json: {
    image: string;
    perspective_applied: boolean;
    quality: { sharpness: number; brightness: number; is_blurry: boolean; issues: string[]; legibility: number };
    zones: Record<string, { x: number; y: number; w: number; h: number }>;
  };
  try {
    json = await res.json() as typeof json;
  } catch {
    console.warn("[opencv] resposta inválida");
    return null;
  }

  return {
    buffer: Buffer.from(json.image, "base64"),
    perspectiveApplied: json.perspective_applied,
    quality: {
      sharpness: json.quality.sharpness,
      brightness: json.quality.brightness,
      isBlurry: json.quality.is_blurry,
      issues: json.quality.issues,
      legibility: json.quality.legibility,
    },
    zones: json.zones,
  };
}

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
