import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", f), "utf8");

describe("becos sem saída de UI", () => {
  it("DialogContent base tem altura máxima e scroll (UX-17, UI-08)", () => {
    const src = read("components/ui/dialog.tsx");
    expect(src).toContain("max-h-[90dvh]");
    expect(src).toContain("overflow-y-auto");
  });
  it("o diálogo 'Iniciar jogo' tem saída (UX-09)", () => {
    const src = read("app/(dashboard)/jogos/[eventId]/live/page.tsx");
    expect(src).toMatch(/router\.push\("\/jogos"\)/);
    expect(src).toContain("Cancelar");
  });
});
