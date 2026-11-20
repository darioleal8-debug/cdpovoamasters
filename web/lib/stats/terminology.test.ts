import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NBA_STATS, periodLabel, abbr } from "./terminology";

/**
 * Garante que as estatísticas mostradas na app (gestão, live, relatórios, PDF, Liga) usam sempre
 * a terminologia NBA em inglês. Se este teste falhar, usar lib/stats/terminology.ts.
 * Importadores (prompts que LEEM folhas em português) e nomes de colunas da BD ficam de fora.
 */
const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = [
  "app/player", "app/liga-inatel", "app/(live)", "app/(dashboard)/estatisticas", "app/(dashboard)/jogos",
  "components/player", "components/live", "components/liga", "components/competitions", "components/games",
  "components/historico", "lib/pdf-export.ts", "lib/match-docs/pro-stats-schema.ts",
];

// Etiquetas visíveis (entre aspas/JSX) que nunca devem aparecer
const FORBIDDEN: RegExp[] = [
  />\s*(ROU|DES|PER|FS|LL|LL%|RO|RD|RES)\s*</, /"(ROU|DES|PER|FS|LL|LL%|RO|RD|RES)"/,
  /C\/T/, /\bLL C\/T\b/, /["'>](Roubos?|Desarmes?|Ressaltos?|Assistências|Perdas de bola|Lances livres|Triplos|Faltas sofridas|F\. Dadas|F\. Sofridas)["'<]/,
  /["'>](RESSALTOS|ASSISTÊNCIAS|ROUBOS|TRIPLOS)["'<]/, /\d+º P\b|º PERÍODO|º Período|PROL\./,
];

function walk(p: string, out: string[] = []): string[] {
  const full = join(ROOT, p);
  const st = statSync(full);
  if (st.isFile()) { out.push(full); return out; }
  for (const f of readdirSync(full)) {
    if (f === "node_modules" || f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
    const child = join(p, f);
    if (statSync(join(ROOT, child)).isDirectory()) walk(child, out);
    else if (/\.(tsx?|ts)$/.test(f)) out.push(join(ROOT, child));
  }
  return out;
}

describe("terminologia NBA", () => {
  it("glossário: siglas esperadas", () => {
    expect(abbr("blk")).toBe("BLK");
    expect(abbr("tov")).toBe("TOV");
    expect(abbr("pf")).toBe("PF");
    expect(abbr("pfd")).toBe("PFD");
    expect(NBA_STATS.oreb.name).toBe("Offensive rebounds");
  });

  it("períodos: Q1–Q4, OT, 2OT", () => {
    expect([1, 4, 5, 6].map(periodLabel)).toEqual(["Q1", "Q4", "OT", "2OT"]);
  });

  it("nenhum ecrã usa etiquetas de estatística em português", () => {
    const offenders: string[] = [];
    for (const f of SCAN_DIRS.flatMap((d) => walk(d))) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (FORBIDDEN.some((re) => re.test(line))) offenders.push(`${f.replace(ROOT + "/", "")}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
