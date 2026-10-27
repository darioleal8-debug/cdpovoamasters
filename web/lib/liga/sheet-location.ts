/**
 * Localização da folha de jogo guardada em result_submissions.photo_url.
 *
 * Formatos existentes:
 *  - caminho no bucket privado `folhas-jogo` ("<user>/<ano>/<jogo>/<ficheiro>") — fluxo atual
 *  - URL assinado antigo do Supabase Storage (já expirado), ex. bucket `game-sheets`
 * Só se aceitam os buckets das folhas de jogo, para nunca assinar outros ficheiros.
 */
export const SHEET_BUCKETS = ["folhas-jogo", "game-sheets"] as const;
export type SheetBucket = (typeof SHEET_BUCKETS)[number];

export interface SheetLocation {
  bucket: SheetBucket;
  path: string;
  kind: "image" | "pdf";
}

function kindOf(path: string): "image" | "pdf" {
  return /\.pdf$/i.test(path) ? "pdf" : "image";
}

function isSafePath(path: string): boolean {
  return path.length > 0 && path.length < 500 && !path.split("/").some((seg) => seg === ".." || seg === "");
}

export function resolveSheetLocation(photoUrl: string | null | undefined): SheetLocation | null {
  const raw = photoUrl?.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try { url = new URL(raw); } catch { return null; }
    const m = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    const bucket = m[1] as SheetBucket;
    const path = decodeURIComponent(m[2]);
    if (!SHEET_BUCKETS.includes(bucket) || !isSafePath(path)) return null;
    return { bucket, path, kind: kindOf(path) };
  }

  // Caminho relativo; aceita também o prefixo "folhas-jogo/" ou "game-sheets/"
  const prefixed = SHEET_BUCKETS.find((b) => raw.startsWith(`${b}/`));
  const bucket: SheetBucket = prefixed ?? "folhas-jogo";
  const path = prefixed ? raw.slice(prefixed.length + 1) : raw;
  if (!isSafePath(path)) return null;
  return { bucket, path, kind: kindOf(path) };
}
