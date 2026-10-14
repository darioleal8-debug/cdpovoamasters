import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("lista de treinos (PRES-12)", () => {
  it("não mostra uma contagem 'N marcados' que não depende do treino", () => {
    const src = readFileSync(path.join(__dirname, "..", "..", "components/trainings/trainings-list.tsx"), "utf8");
    expect(src).not.toContain("presentCount");
    expect(src).not.toContain("marcados`");
  });
  it("o modal de presenças grava só atletas elegíveis e não fecha em caso de erro", () => {
    const src = readFileSync(path.join(__dirname, "..", "..", "components/trainings/attendance-modal.tsx"), "utf8");
    expect(src).toContain("eligibleRoster(players)");
    expect(src).toContain("if (ok) onClose();");
  });
});
