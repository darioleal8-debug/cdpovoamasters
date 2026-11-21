import { describe, it, expect } from "vitest";
import { LIVE_TUTORIAL, tutorialAsText, tutorialSystemPrompt, TUTORIAL_QUESTION_MAX } from "./tutorial";

describe("tutorial do live", () => {
  it("tem secções com id único e título", () => {
    const ids = LIVE_TUTORIAL.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LIVE_TUTORIAL.every((s) => s.title.length > 0)).toBe(true);
  });

  it("cobre os temas pedidos pelos utilizadores (períodos, nomes de botões, terminar jogo)", () => {
    const text = tutorialAsText();
    expect(text).toMatch(/End P1 → P2/);
    expect(text).toMatch(/Finish game/);
    expect(text).toMatch(/Start/);
    expect(text).toMatch(/History \/ Undo/);
  });

  it("o prompt da IA inclui o tutorial, pede json e restringe à matéria do tutorial", () => {
    const p = tutorialSystemPrompt();
    expect(p).toMatch(/json/i);
    expect(p).toMatch(/APENAS com base no tutorial/);
    expect(p).toContain(LIVE_TUTORIAL[0].title);
    expect(TUTORIAL_QUESTION_MAX).toBeGreaterThan(0);
  });
});
