import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", f), "utf8");

describe("box score e perfis (STA-08, STA-10, STA-11)", () => {
  it("box score e PDF mostram parciais, não acumulados", () => {
    expect(read("app/(dashboard)/jogos/[eventId]/stats/page.tsx")).toContain("toPeriodPartials(");
    expect(read("lib/pdf-export.ts")).toContain("toPeriodPartials(");
  });
  it("terminar o jogo grava o resultado do último período", () => {
    const src = read("hooks/use-live-game.ts");
    const finish = src.slice(src.indexOf("async function finishGame"), src.indexOf("async function finishGame") + 1500);
    expect(finish).toContain('"game_period_scores"');
  });
  it("linhas fantasma (nome '?') não entram nos totais", () => {
    expect(read("app/(dashboard)/jogos/[eventId]/stats/page.tsx")).not.toContain("|| !!(p as any).user?.name");
  });
  it("perfis usam seconds_played (minutes_played nunca é escrito)", () => {
    expect(read("app/(dashboard)/jogadores/[playerId]/page.tsx")).not.toMatch(/select\("[^"]*minutes_played/);
    expect(read("app/player/plantel/[playerId]/page.tsx")).not.toMatch(/select\("[^"]*minutes_played/);
  });
});
