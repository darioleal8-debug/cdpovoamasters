import { describe, it, expect } from "vitest";
import { canViewAsPlayer, canReturnToDashboard } from "./view-as";

describe("ver como jogador", () => {
  it("staff com ficha de jogador pode ver a área do jogador", () => {
    expect(canViewAsPlayer("admin", true)).toBe(true);
    expect(canViewAsPlayer("treinador", true)).toBe(true);
    expect(canViewAsPlayer("tesoureiro", true)).toBe(true);
  });

  it("sem ficha de jogador não há área do jogador para ver", () => {
    expect(canViewAsPlayer("admin", false)).toBe(false);
  });

  it("seccionista é redirecionado da área do jogador; jogador já lá está", () => {
    expect(canViewAsPlayer("seccionista", true)).toBe(false);
    expect(canViewAsPlayer("jogador", true)).toBe(false);
  });

  it("qualquer papel de gestão pode voltar ao dashboard; jogador não", () => {
    expect(canReturnToDashboard("admin")).toBe(true);
    expect(canReturnToDashboard("tesoureiro")).toBe(true);
    expect(canReturnToDashboard("jogador")).toBe(false);
  });
});
