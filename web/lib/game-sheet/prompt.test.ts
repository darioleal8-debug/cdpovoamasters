import { describe, expect, test } from "vitest";
import { buildSystemPrompt, MAX_ADMIN_INSTRUCTIONS } from "./prompt";

describe("buildSystemPrompt com instruções do admin", () => {
  test("sem instruções, o prompt não inclui o bloco do admin", () => {
    expect(buildSystemPrompt()).not.toContain("INSTRUÇÕES DO ADMIN");
    expect(buildSystemPrompt("inatel-fiba", "   ")).not.toContain("INSTRUÇÕES DO ADMIN");
  });

  test("com instruções, acrescenta o bloco no fim e mantém o formato JSON", () => {
    const p = buildSystemPrompt("inatel-fiba", "A equipa A é a visitante.");
    expect(p).toContain("INSTRUÇÕES DO ADMIN DA LIGA");
    expect(p).toContain("A equipa A é a visitante.");
    expect(p.indexOf("scoringEvents")).toBeLessThan(p.indexOf("INSTRUÇÕES DO ADMIN"));
  });

  test("limita o tamanho das instruções", () => {
    const p = buildSystemPrompt("inatel-fiba", "§".repeat(MAX_ADMIN_INSTRUCTIONS + 500));
    expect(p.match(/§/g)!.length).toBe(MAX_ADMIN_INSTRUCTIONS);
  });
});
