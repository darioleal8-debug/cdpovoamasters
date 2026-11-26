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

export interface VisionCrop { buffer: Buffer; label: string }

export type RegionKind = "runningScore" | "rosterA" | "rosterB";

/**
 * Posição das zonas na folha INATEL inteira e na vertical (fração da imagem), medida numa
 * fotografia real da folha. Servem de valor por omissão quando o modelo não localiza a zona.
 */
export const DEFAULT_REGIONS: Record<RegionKind, Region> = {
  // tabela MARCHA DO RESULTADO: 4 blocos de 40 linhas, do cabeçalho "A B" à linha 40
  runningScore: { x: 0.48, y: 0.175, w: 0.465, h: 0.607 },
  // quadros dos plantéis (Nº ASSOC., nome, JOG Nº, ENT, faltas), com o nome da equipa
  rosterA: { x: 0.03, y: 0.205, w: 0.47, h: 0.325 },
  rosterB: { x: 0.03, y: 0.52, w: 0.47, h: 0.34 },
};

/**
 * Usa a caixa localizada pelo modelo só se for plausível (dentro da imagem, tamanho e posição
 * próximos do esperado para a folha INATEL); caso contrário usa a posição por omissão.
 */
export function resolveRegion(kind: RegionKind, modelRegion: Region | null | undefined): { region: Region; source: "model" | "template" } {
  const d = DEFAULT_REGIONS[kind];
  const r = modelRegion;
  if (r && r.w > 0.05 && r.h > 0.05 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001) {
    const sizeOk = r.w / d.w >= 0.6 && r.w / d.w <= 1.6 && r.h / d.h >= 0.6 && r.h / d.h <= 1.6;
    const near = Math.abs(r.x + r.w / 2 - (d.x + d.w / 2)) <= 0.18 && Math.abs(r.y + r.h / 2 - (d.y + d.h / 2)) <= 0.18;
    if (sizeOk && near) return { region: r, source: "model" };
  }
  return { region: d, source: "template" };
}

async function cropNormalized(
  prepared: PreparedImage,
  box: { x0: number; y0: number; x1: number; y1: number },
  target: { minHeight: number; maxHeight: number },
): Promise<Buffer | null> {
  const x0 = Math.max(0, Math.min(1, box.x0));
  const y0 = Math.max(0, Math.min(1, box.y0));
  const x1 = Math.max(0, Math.min(1, box.x1));
  const y1 = Math.max(0, Math.min(1, box.y1));
  const left = Math.floor(x0 * prepared.width);
  const top = Math.floor(y0 * prepared.height);
  const width = Math.floor((x1 - x0) * prepared.width);
  const height = Math.floor((y1 - y0) * prepared.height);
  if (width < 16 || height < 16) return null;
  // O modelo reduz cada imagem a um orçamento fixo de píxeis: recortes pequenos são ampliados para
  // a escrita chegar com detalhe; recortes enormes são reduzidos.
  const outHeight = Math.max(target.minHeight, Math.min(target.maxHeight, height));
  return sharp(prepared.buffer)
    .extract({ left, top, width, height })
    .resize({ height: outHeight, kernel: "lanczos3" })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Recorte de uma zona (ex.: quadro de um plantel) com margem. */
export async function regionCrop(prepared: PreparedImage, region: Region, label: string, pad = 0.015): Promise<VisionCrop | null> {
  const buffer = await cropNormalized(
    prepared,
    { x0: region.x - pad, y0: region.y - pad, x1: region.x + region.w + pad, y1: region.y + region.h + pad },
    { minHeight: 1400, maxHeight: 2200 },
  );
  return buffer ? { buffer, label } : null;
}

/** Quantos blocos da marcha (40 pontos cada) o jogo usa, pelo maior resultado final lido. */
export function scoreBlocksNeeded(finalA: number | null, finalB: number | null): number[] {
  const max = Math.max(finalA ?? 0, finalB ?? 0);
  const n = max > 0 ? Math.min(4, Math.ceil(max / 40)) : 4;
  return Array.from({ length: n }, (_, i) => i + 1);
}

/**
 * Recortes da marcha do resultado, um por bloco e por metade (linhas 1–20 e 21–40), ampliados.
 *
 * A folha tem 4 blocos de igual largura lado a lado; cada bloco tem 4 colunas, da esquerda para a
 * direita: [jogador A][acumulado A][acumulado B][jogador B]. Cada recorte leva uma pequena margem
 * lateral (para não cortar as colunas dos jogadores) e as metades sobrepõem-se ~2 linhas (cada cesto
 * é uma linha horizontal, por isso nunca fica partido ao meio entre recortes).
 */
export async function scoreBlockCrops(prepared: PreparedImage, region: Region, blocks: number[]): Promise<VisionCrop[]> {
  const bw = region.w / 4;
  const padX = bw * 0.05;
  const halves: { name: string; from: number; to: number; rows: string }[] = [
    { name: "metade superior", from: -0.012, to: 0.53, rows: "linhas 1–21" },
    { name: "metade inferior", from: 0.47, to: 1.012, rows: "linhas 20–40" },
  ];
  const out: VisionCrop[] = [];
  for (const k of blocks) {
    const first = 40 * (k - 1) + 1;
    for (const h of halves) {
      const buffer = await cropNormalized(
        prepared,
        {
          x0: region.x + (k - 1) * bw - padX,
          x1: region.x + k * bw + padX,
          y0: region.y + region.h * h.from,
          y1: region.y + region.h * h.to,
        },
        { minHeight: 1500, maxHeight: 2400 },
      );
      if (!buffer) continue;
      const rows = h.name === "metade superior" ? `${first}–${first + 20}` : `${first + 19}–${first + 39}`;
      out.push({ buffer, label: `bloco ${k}, ${h.name} (acumulados impressos ${rows})` });
    }
  }
  return out;
}
