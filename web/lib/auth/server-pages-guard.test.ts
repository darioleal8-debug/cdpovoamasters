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

describe("páginas server com service role chamam authorize()", () => {
  for (const file of pages(APP)) {
    const src = readFileSync(file, "utf8");
    if (!/createAdminClient|SERVICE_ROLE/.test(src)) continue;
    it(path.relative(APP, file), () => expect(src).toMatch(/authorize\(/));
  }
});
