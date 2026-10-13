import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
const WEB = path.join(__dirname, "..", "..");
const ROOT = path.join(WEB, "..");

describe("higiene do repositório (QUAL-08/10/13, STA-18, UI-05)", () => {
  const dead = [
    "components/live/mobile-scoring",   // pasta sombreada por mobile-scoring.tsx
    "lib/scoring-queue.ts",
    "app/api/play-events",
    "hooks/use-game-session.ts",
    "components/payments/payments-table.tsx",
    "components/payments/player-payments-table.tsx",
    "components/players/players-table.tsx",
    "trace.txt",
    "app/api/players/[playerId]/stats", // sem consumidores; procurava por user_id (STA-03)
  ];
  for (const f of dead) {
    it(`código morto removido: web/${f}`, () => expect(existsSync(path.join(WEB, f))).toBe(false));
  }
  it("artefactos soltos removidos da raiz", () => {
    expect(existsSync(path.join(ROOT, "disponibilidade-ficheiros.zip"))).toBe(false);
    expect(existsSync(path.join(ROOT, "disponibilidade-jogos-treinos.patch"))).toBe(false);
  });
  it("ESLint configurado e script de lint", () => {
    expect(existsSync(path.join(WEB, "eslint.config.mjs"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(WEB, "package.json"), "utf8")).scripts.lint).toBe("eslint .");
  });
  it("CI corre tsc, lint, testes e build", () => {
    const ci = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
    for (const step of ["tsc --noEmit", "npm run lint", "npm test", "next build"]) expect(ci).toContain(step);
  });
  it(".gitignore ignora tsbuildinfo e trace.txt", () => {
    const gi = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    expect(gi).toContain("*.tsbuildinfo");
    expect(gi).toContain("trace.txt");
  });
});
