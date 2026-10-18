import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FILES = [
  "app/api/trainings/[id]/attendance/auto/route.ts",
  "app/api/dashboard/route.ts",
  "components/games/next-game-card.tsx",
  "app/player/meus-treinos/page.tsx",
  "app/player/meus-jogos/page.tsx",
  "app/player/minha-area/page.tsx",
  "components/trainings/trainings-list.tsx",
  // revisão A.2, Imp. 6: próximo treino e datas de pagamento por omissão
  "components/dashboard/next-training-card.tsx",
  "components/payments/cell-popover.tsx",
  "components/payments/register-payment-modal.tsx",
];

describe("'hoje' calculado no fuso do clube (PRES-14, CONV-13)", () => {
  for (const f of FILES) {
    it(f, () => {
      const src = readFileSync(path.join(__dirname, "..", "..", f), "utf8");
      expect(src).not.toContain("toISOString().slice(0, 10)");
      expect(src).toContain("todayInClubTz(");
    });
  }
});
