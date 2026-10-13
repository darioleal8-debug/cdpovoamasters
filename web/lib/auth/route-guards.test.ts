import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cada rota abaixo tem de chamar authorize() com o grupo indicado (auditoria: DAT-01, SEC-03/13/15/16/17/26, CONV-07, DAT-20).
const EXPECTED: Record<string, string> = {
  "app/api/players/route.ts": "authorize(MANAGERS)",
  "app/api/players/[playerId]/stats/route.ts": "authorize()",
  "app/api/hist/players/route.ts": "authorize()",
  "app/api/hist/games/route.ts": "authorize()",
  "app/api/deepseek/evaluation/route.ts": "authorize(MANAGERS)",
  "app/api/club-settings/logo/route.ts": "authorize(ADMIN)",
  "app/api/import-calendar/route.ts": "authorize(MANAGERS)",
  "app/api/chat/event-sync/route.ts": "authorize(MANAGERS)",
  "app/api/trainings/route.ts": "authorize(MANAGERS)",
  "app/api/trainings/[id]/route.ts": "authorize(MANAGERS)",
  "app/api/trainings/[id]/attendance/route.ts": "authorize(MANAGERS)",
  "app/api/games/[id]/callups/route.ts": "authorize(MANAGERS)",
  "app/api/games/[id]/callups/[callupId]/route.ts": "authorize(MANAGERS)",
  "app/api/player-payments/route.ts": "authorize(FINANCE)",
  "app/api/player-payments/[id]/route.ts": "authorize(FINANCE)",
};

describe("rotas protegidas por papel", () => {
  for (const [file, call] of Object.entries(EXPECTED)) {
    it(`${file} usa ${call}`, () => {
      const src = readFileSync(path.join(__dirname, "..", "..", file), "utf8");
      expect(src).toContain(call);
    });
  }

  it("club-settings/logo não aceita SVG", () => {
    const src = readFileSync(path.join(__dirname, "..", "..", "app/api/club-settings/logo/route.ts"), "utf8");
    expect(src).not.toContain("image/svg+xml");
  });

  it("finance-auth procura o perfil por id e não por email", () => {
    const src = readFileSync(path.join(__dirname, "..", "finance-auth.ts"), "utf8");
    expect(src).not.toMatch(/\.eq\("email"/);
  });
});
