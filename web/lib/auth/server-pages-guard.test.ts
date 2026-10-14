import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Revisão final (Importante 3): páginas server que usam service role não podem confiar só no layout
// (na navegação cliente o layout partilhado não volta a correr).
const APP = path.join(__dirname, "..", "..", "app");
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === "api" ? [] : pages(p);
    return f === "page.tsx" ? [p] : [];
  });
}

// Páginas públicas por design (sem sessão): só mostram dados publicáveis.
const PUBLIC_BY_DESIGN = new Set([
  "equipa/[slug]/page.tsx",            // página pública da equipa (só com club_settings.is_public)
  "liga-inatel/page.tsx",              // classificação pública da liga
  "liga-inatel/jogo/[eventId]/page.tsx", // ficha pública de jogo da liga
]);

describe("páginas server com service role chamam authorize()", () => {
  for (const file of pages(APP)) {
    const src = readFileSync(file, "utf8");
    if (!/createAdminClient|SERVICE_ROLE/.test(src) || PUBLIC_BY_DESIGN.has(path.relative(APP, file))) continue;
    it(path.relative(APP, file), () => expect(src).toMatch(/authorize\(/));
  }
});
