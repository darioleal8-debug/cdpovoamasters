import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const routeExists = (href: string) => existsSync(path.join(ROOT, "app", href, "page.tsx"));

describe("navegação do atleta não aponta para páginas inexistentes (UX-01, UX-24)", () => {
  for (const f of ["components/player/player-bottom-nav.tsx", "app/player/mais/page.tsx", "app/player/minha-area/page.tsx"]) {
    it(`${f}: todos os hrefs /player/* existem`, () => {
      const hrefs = [...read(f).matchAll(/href[:=]\s*["'`](\/player[^"'`?#]*)["'`]/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      const missing = hrefs.filter((h) => !routeExists(h));
      expect(missing).toEqual([]);
    });
  }
  it("minha-area não manda o atleta para /palmares do dashboard", () => {
    expect(read("app/player/minha-area/page.tsx")).not.toMatch(/href[:=]\s*["'`]\/palmares["'`]/);
  });
});

describe("perfil de jogador da época correta (PRES-08, UX-19)", () => {
  it("auto-presença procura o perfil da época do treino", () => {
    expect(read("app/api/trainings/[id]/attendance/auto/route.ts")).toMatch(/\.eq\("season_id", training\.season_id\)/);
  });
  it("minha-area procura o perfil da época ativa", () => {
    const src = read("app/player/minha-area/page.tsx");
    const block = src.slice(src.indexOf("linkedPlayer"), src.indexOf("linkedPlayer") + 300);
    expect(block).toMatch(/\.eq\("season_id"/);
  });
});
