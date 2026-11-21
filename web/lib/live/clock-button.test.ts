import { describe, it, expect } from "vitest";
import { clockButtonColors } from "./clock-button";

describe("clockButtonColors", () => {
  it("verde quando mostra Start (relógio parado)", () => {
    expect(clockButtonColors(false).background).toBe("#16a34a");
  });
  it("vermelho quando mostra Stop (relógio a correr)", () => {
    expect(clockButtonColors(true).background).toBe("#dc2626");
  });
});
