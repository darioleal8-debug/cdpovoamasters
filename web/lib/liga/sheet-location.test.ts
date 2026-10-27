import { describe, it, expect } from "vitest";
import { resolveSheetLocation } from "./sheet-location";

describe("resolveSheetLocation", () => {
  it("caminho do fluxo atual → bucket folhas-jogo", () => {
    expect(resolveSheetLocation("49a1e6d4/2026/9f63e71e/1793.jpg")).toEqual({
      bucket: "folhas-jogo", path: "49a1e6d4/2026/9f63e71e/1793.jpg", kind: "image",
    });
  });

  it("aceita prefixo do bucket no caminho", () => {
    expect(resolveSheetLocation("folhas-jogo/u/2026/g/a.pdf")).toEqual({ bucket: "folhas-jogo", path: "u/2026/g/a.pdf", kind: "pdf" });
  });

  it("URL assinado antigo (expirado) → volta a assinar o mesmo ficheiro", () => {
    const url = "https://x.supabase.co/storage/v1/object/sign/game-sheets/dd34/1792593410733.jpg?token=abc";
    expect(resolveSheetLocation(url)).toEqual({ bucket: "game-sheets", path: "dd34/1792593410733.jpg", kind: "image" });
  });

  it("recusa outros buckets, URLs externos e caminhos com ..", () => {
    expect(resolveSheetLocation("https://x.supabase.co/storage/v1/object/sign/avatars/u/a.jpg?t=1")).toBeNull();
    expect(resolveSheetLocation("https://example.com/folha.jpg")).toBeNull();
    expect(resolveSheetLocation("../outro-bucket/segredo.jpg")).toBeNull();
    expect(resolveSheetLocation("a//b.jpg")).toBeNull();
  });

  it("sem folha → null", () => {
    expect(resolveSheetLocation(null)).toBeNull();
    expect(resolveSheetLocation("  ")).toBeNull();
  });
});
