import { describe, expect, it } from "vitest";
import { aggressiveTerms } from "./news-tone";

describe("aggressiveTerms", () => {
  it("deteta termos agressivos e as suas flexões", () => {
    expect(aggressiveTerms("CD Póvoa atropela a Portuguesa de Leça por 49-23")).toEqual(["atropelar"]);
    expect(aggressiveTerms("ATROPELOU")).toEqual(["atropelar"]);
    expect(aggressiveTerms("Uma vitória esmagadora")).toEqual(["esmagar"]);
    expect(aggressiveTerms("arrasou o adversário e humilhou-o")).toEqual(["arrasar", "humilhar"]);
    expect(aggressiveTerms("venceu sem piedade")).toEqual(["impiedoso"]);
  });

  it("aceita formulações amistosas", () => {
    expect(aggressiveTerms("CD Póvoa vence com autoridade a Portuguesa de Leça por 49-23 na Série A")).toEqual([]);
    expect(aggressiveTerms("Vitória folgada, triunfo claro e vantagem confortável")).toEqual([]);
    expect(aggressiveTerms("A equipa arrastou o jogo para o prolongamento")).toEqual([]);
  });
});
