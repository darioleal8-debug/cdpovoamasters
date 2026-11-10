/**
 * Preparação de documentos para o modelo de visão:
 *  - PDF: camada de texto por página + renderização de TODAS as páginas (até ao limite)
 *  - Imagens: orientação EXIF, resolução preservada; imagens altas (capturas de ecrã de
 *    telemóvel, tabelas longas) são divididas em secções sobrepostas para não perderem detalhe
 *
 * Nunca altera o original guardado: tudo isto é feito sobre cópias em memória.
 */
import sharp from "sharp";

/** Máximo de páginas de um PDF enviadas ao modelo (custo/tempo). */
export const MAX_PDF_PAGES = 6;
/** Lado maior de cada imagem enviada (detail=high preserva a resolução de origem). */
const MAX_SIDE = 2400;
/** Fotografias pequenas são ampliadas até esta largura (texto mais legível para o modelo). */
const MIN_WIDTH = 1800;
/** Proporção a partir da qual uma imagem é dividida em secções verticais. */
const TALL_RATIO = 1.45;
const MAX_TILES = 4;

export interface VisionPage {
  /** JPEG pronto a enviar */
  buffer: Buffer;
  width: number;
  height: number;
  /** Etiqueta para o prompt ("página 2", "secção 1/3 da imagem") */
  label: string;
}

export interface PreparedDocument {
  kind: "image" | "pdf";
  pages: VisionPage[];
  /** Texto extraído da camada de texto do PDF (por página), quando existe */
  textLayer: string[];
  pageCount: number;
  /** Avisos de preparação (páginas ignoradas, falha na renderização, etc.) */
  notes: string[];
}

async function toJpeg(input: Buffer, opts: { digital?: boolean } = {}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate().metadata();
  const rotated = meta.orientation && meta.orientation >= 5;
  const w = (rotated ? meta.height : meta.width) ?? 0;
  const h = (rotated ? meta.width : meta.height) ?? 0;
  let img = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  if (w > 0 && w < MIN_WIDTH && Math.max(w, h) * (MIN_WIDTH / w) <= MAX_SIDE * 1.5) {
    // Ampliação de imagens pequenas (lanczos + nitidez ligeira): melhora a leitura de tabelas fotografadas
    img = img.resize({ width: MIN_WIDTH, kernel: "lanczos3" }).sharpen({ sigma: 0.7 });
  } else {
    img = img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
  }
  // Documento digital (tabelas): sem nitidez artificial; fotografia: contraste moderado
  if (!opts.digital) img = img.normalise({ lower: 1, upper: 99 });
  const { data, info } = await img.jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/**
 * Divide uma imagem alta em secções sobrepostas (10 %) com a largura completa, para que o
 * texto pequeno não seja reduzido pelo modelo. Imagens normais devolvem uma única "página".
 */
export async function tileTallImage(input: Buffer, label = "imagem", opts: { digital?: boolean } = {}): Promise<VisionPage[]> {
  const base = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const meta = await base.metadata();
  const rotated = meta.orientation && meta.orientation >= 5;
  const w = (rotated ? meta.height : meta.width) ?? 0;
  const h = (rotated ? meta.width : meta.height) ?? 0;
  if (!w || !h) throw new Error("Imagem sem dimensões");

  if (h / w < TALL_RATIO) {
    const j = await toJpeg(input, opts);
    return [{ ...j, label }];
  }
  const upright = await base.toBuffer();
  const n = Math.min(MAX_TILES, Math.ceil(h / (w * 1.15)));
  const overlap = Math.round(h * 0.05);
  const step = Math.ceil(h / n);
  const tiles: VisionPage[] = [];
  for (let i = 0; i < n; i++) {
    const top = Math.max(0, i * step - overlap);
    const height = Math.min(h - top, step + 2 * overlap);
    const piece = await sharp(upright).extract({ left: 0, top, width: w, height }).toBuffer();
    const j = await toJpeg(piece, opts);
    tiles.push({ ...j, label: `${label} — secção ${i + 1}/${n} (de cima para baixo)` });
  }
  return tiles;
}

/** Texto + páginas renderizadas de um PDF. Falhas na renderização não impedem o uso do texto. */
export async function preparePdf(buffer: Buffer, opts: { renderWidth?: number; maxPages?: number; tile?: boolean } = {}): Promise<PreparedDocument> {
  const maxPages = opts.maxPages ?? MAX_PDF_PAGES;
  const notes: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { PDFParse } = (await import("pdf-parse")) as any;
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  let textLayer: string[] = [];
  let pageCount = 0;
  const pages: VisionPage[] = [];
  try {
    const text = await parser.getText();
    pageCount = Number(text.total ?? text.pages?.length ?? 0);
    textLayer = ((text.pages ?? []) as { text: string }[]).map((p) => (p.text ?? "").trim());
    if (pageCount > maxPages) notes.push(`PDF com ${pageCount} páginas: analisadas as primeiras ${maxPages}.`);
    try {
      const shot = await parser.getScreenshot({ first: maxPages, desiredWidth: opts.renderWidth ?? 1800, imageBuffer: true, imageDataUrl: false });
      for (const p of (shot.pages ?? []) as { data: Uint8Array; pageNumber: number }[]) {
        if (!p.data?.length) continue;
        if (opts.tile === false) {
          const meta = await sharp(Buffer.from(p.data)).metadata();
          pages.push({ buffer: Buffer.from(p.data), width: meta.width ?? 0, height: meta.height ?? 0, label: `página ${p.pageNumber}` });
        } else {
          pages.push(...(await tileTallImage(Buffer.from(p.data), `página ${p.pageNumber}`, { digital: true })));
        }
      }
    } catch (e) {
      notes.push(`Não foi possível renderizar as páginas do PDF (${(e as Error).message?.slice(0, 120)}); usada só a camada de texto.`);
    }
  } finally {
    await parser.destroy?.().catch?.(() => undefined);
  }
  if (!pageCount) pageCount = Math.max(textLayer.length, pages.length);
  return { kind: "pdf", pages: pages.slice(0, maxPages * 2), textLayer: textLayer.slice(0, maxPages), pageCount, notes };
}

export async function prepareDocument(buffer: Buffer, mime: string, opts: { digital?: boolean } = {}): Promise<PreparedDocument> {
  if (mime === "application/pdf") return preparePdf(buffer);
  const pages = await tileTallImage(buffer, "imagem", opts);
  return { kind: "image", pages, textLayer: [], pageCount: 1, notes: [] };
}

/** Há texto suficiente na camada de texto para servir de referência ao modelo? */
export function hasUsefulText(doc: PreparedDocument): boolean {
  return doc.textLayer.join("\n").replace(/\s+/g, "").length >= 80;
}

export function imagePart(buf: Buffer, detail: "high" | "low" | "auto" = imageDetail()) {
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}`, detail } };
}

/** Nível de detalhe pedido ao DeepSeek (high = resolução de origem). Configurável por env. */
export function imageDetail(): "high" | "low" | "auto" {
  const v = (process.env.DEEPSEEK_IMAGE_DETAIL ?? "high").toLowerCase();
  return v === "low" || v === "auto" ? v : "high";
}

/**
 * Ampliações para a 2.ª leitura: metade esquerda e metade direita (com sobreposição de 20 %)
 * de cada página, ampliadas — as colunas da direita de uma tabela fotografada ficam legíveis.
 */
export async function zoomHalves(pages: VisionPage[], maxPages = 2): Promise<VisionPage[]> {
  const out: VisionPage[] = [];
  for (const p of pages.slice(0, maxPages)) {
    const w = p.width, h = p.height;
    if (!w || !h) continue;
    for (const [label, left, width] of [["metade esquerda", 0, Math.round(w * 0.6)], ["metade direita", Math.round(w * 0.4), w - Math.round(w * 0.4)]] as const) {
      const buf = await sharp(p.buffer).extract({ left, top: 0, width, height: h })
        .resize({ width: Math.min(2400, Math.max(1600, width * 2)), kernel: "lanczos3" }).sharpen({ sigma: 0.8 })
        .jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
      out.push({ buffer: buf.data, width: buf.info.width, height: buf.info.height, label: `${p.label} — ampliação da ${label}` });
    }
  }
  return out;
}
