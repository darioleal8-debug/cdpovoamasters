// Browser-only: usa Canvas API. Não importar em Server Components.

export interface PhotoTemplateConfig {
  version: number;
  enabled: boolean;
  output: { width: number; height: number };
  background_color: string;
  background_url: string | null;
  photo_area: { x: number; y: number; width: number; height: number };
  photo_shape: "rect" | "rounded";
  photo_border_radius: number;
  logo_url: string | null;
  logo_area: { x: number; y: number; width: number; height: number } | null;
}

export const DEFAULT_TEMPLATE: PhotoTemplateConfig = {
  version: 1,
  enabled: false,
  output: { width: 600, height: 800 },
  background_color: "#0A1220",
  background_url: null,
  photo_area: { x: 60, y: 80, width: 480, height: 560 },
  photo_shape: "rect",
  photo_border_radius: 0,
  logo_url: null,
  logo_area: null,
};

// ── Helpers ────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function clipPhotoArea(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  shape: PhotoTemplateConfig["photo_shape"],
  r: number
) {
  ctx.beginPath();
  if (shape === "rounded" && r > 0) {
    const cr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + cr, y);
    ctx.lineTo(x + w - cr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
    ctx.lineTo(x + w, y + h - cr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
    ctx.lineTo(x + cr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
    ctx.lineTo(x, y + cr);
    ctx.quadraticCurveTo(x, y, x + cr, y);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
  ctx.clip();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  areaX: number, areaY: number, areaW: number, areaH: number,
  focalX: number, focalY: number
) {
  const scaleX = areaW / img.naturalWidth;
  const scaleY = areaH / img.naturalHeight;
  const scale  = Math.max(scaleX, scaleY);
  const sw     = img.naturalWidth  * scale;
  const sh     = img.naturalHeight * scale;

  // clamp offset so image fully covers the area
  const maxOX = Math.max(0, sw - areaW);
  const maxOY = Math.max(0, sh - areaH);
  const offX  = -(maxOX * focalX);
  const offY  = -(maxOY * focalY);

  ctx.drawImage(img, areaX + offX, areaY + offY, sw, sh);
}

// ── Core drawing (shared between export and preview) ───────

async function drawTemplate(
  ctx:      CanvasRenderingContext2D,
  template: PhotoTemplateConfig,
  photo:    HTMLImageElement | null,
  focalX:   number,
  focalY:   number,
  scale:    number = 1
) {
  const { output, background_color, background_url, photo_area, photo_shape, photo_border_radius, logo_url, logo_area } = template;

  const W = output.width  * scale;
  const H = output.height * scale;

  // 1 — Background
  if (background_url) {
    try {
      const bg = await loadImage(background_url);
      ctx.drawImage(bg, 0, 0, W, H);
    } catch {
      ctx.fillStyle = background_color;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = background_color;
    ctx.fillRect(0, 0, W, H);
  }

  // 2 — Player photo (or placeholder)
  const pa = photo_area;
  const x  = pa.x * scale;
  const y  = pa.y * scale;
  const w  = pa.width  * scale;
  const h  = pa.height * scale;

  ctx.save();
  clipPhotoArea(ctx, x, y, w, h, photo_shape, photo_border_radius * scale);

  if (photo) {
    drawCover(ctx, photo, x, y, w, h, focalX, focalY);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([8 * scale, 4 * scale]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `${Math.round(w * 0.07)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Área da Fotografia", x + w / 2, y + h / 2);
  }
  ctx.restore();

  // 3 — Logo overlay
  if (logo_url && logo_area) {
    try {
      const logo = await loadImage(logo_url);
      ctx.drawImage(
        logo,
        logo_area.x * scale, logo_area.y * scale,
        logo_area.width * scale, logo_area.height * scale
      );
    } catch { /* logo não crítico */ }
  }
}

// ── Public API ─────────────────────────────────────────────

/** Gera o composto final (WebP) para upload */
export async function compositePhoto(
  original: File | string,
  template: PhotoTemplateConfig,
  focalY = 0.3,
  focalX = 0.5
): Promise<Blob> {
  const src   = typeof original === "string" ? original : await fileToDataUrl(original);
  const photo = await loadImage(src);

  const canvas = document.createElement("canvas");
  canvas.width  = template.output.width;
  canvas.height = template.output.height;
  const ctx = canvas.getContext("2d")!;

  await drawTemplate(ctx, template, photo, focalX, focalY, 1);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("toBlob falhou")),
      "image/webp",
      0.92
    )
  );
}

/** Renderiza o preview num canvas HTML existente */
export async function renderPreview(
  canvas:   HTMLCanvasElement,
  original: File | string | null,
  template: PhotoTemplateConfig,
  focalY:   number,
  focalX:   number
): Promise<void> {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = canvas.width / template.output.width;
  canvas.height = template.output.height * scale;

  let photo: HTMLImageElement | null = null;
  if (original) {
    try {
      const src = typeof original === "string" ? original : await fileToDataUrl(original);
      photo = await loadImage(src);
    } catch { /* skip */ }
  }

  await drawTemplate(ctx, template, photo, focalX, focalY, scale);
}
