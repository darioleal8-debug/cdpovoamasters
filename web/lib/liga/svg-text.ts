import opentype from "opentype.js";
import { INTER_BOLD_B64 } from "./inter-bold-b64";

/**
 * O librsvg (sharp) no Vercel não tem tipos de letra de sistema nem suporta @font-face,
 * pelo que o texto de um SVG sai em quadrados. Aqui o texto é convertido em curvas
 * (paths) com o Inter Bold embutido, o que é independente do ambiente.
 */
let _font: opentype.Font | null = null;
function getFont(): opentype.Font {
  if (_font) return _font;
  const buf = Buffer.from(INTER_BOLD_B64, "base64");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  _font = opentype.parse(ab);
  return _font;
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function textToPath(text: string, o: { x: number; y: number; size: number; anchor: string; ls: number; fill: string; opacity: string | null }): string {
  const font = getFont();
  const scale = o.size / font.unitsPerEm;
  const chars = Array.from(text);
  const glyphs = chars.map((c) => font.charToGlyph(c));
  const advances = glyphs.map((g) => (g.advanceWidth ?? 0) * scale);
  const total = advances.reduce((a, b) => a + b, 0) + o.ls * Math.max(0, chars.length - 1);
  let cx = o.anchor === "middle" ? o.x - total / 2 : o.anchor === "end" ? o.x - total : o.x;
  let d = "";
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, o.y, o.size).toPathData(2);
    cx += advances[i] + o.ls;
  });
  return `<path d="${d}" fill="${o.fill}"${o.opacity ? ` opacity="${o.opacity}"` : ""}/>`;
}

/** Substitui cada <text …>…</text> do SVG por curvas equivalentes. */
export function svgTextToPaths(svg: string): string {
  return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (_m, attrs: string, content: string) => {
    const a: Record<string, string> = {};
    for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1]] = m[2];
    return textToPath(decodeXml(content), {
      x: parseFloat(a.x ?? "0"),
      y: parseFloat(a.y ?? "0"),
      size: parseFloat(a["font-size"] ?? "16"),
      anchor: a["text-anchor"] ?? "start",
      ls: parseFloat(a["letter-spacing"] ?? "0") || 0,
      fill: a.fill ?? "white",
      opacity: a.opacity ?? null,
    });
  });
}
