import { describe, it, expect } from "vitest";
import { buildPlayerProfileUpdate } from "./player-update";

describe("buildPlayerProfileUpdate (DAT-02)", () => {
  it("não apaga campos que não vieram no pedido", () => {
    expect(buildPlayerProfileUpdate({ phone: "912345678" })).toEqual({});
  });
  it("ignora valores vazios/nulos em vez de os gravar como null", () => {
    expect(buildPlayerProfileUpdate({ position: "", height: null, weight: undefined, age: "" })).toEqual({});
  });
  it("grava valores válidos", () => {
    expect(buildPlayerProfileUpdate({ position: "base", height: "185", weight: 82.5, age: 44 }))
      .toEqual({ position: "base", height: 185, weight: 82.5, age: 44 });
  });
  it("rejeita números inválidos em silêncio (não grava NaN nem 0)", () => {
    expect(buildPlayerProfileUpdate({ height: "abc", age: 0 })).toEqual({});
  });
});
