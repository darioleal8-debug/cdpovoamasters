import { describe, it, expect } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath (UX-02, sem open redirect)", () => {
  it("aceita caminhos relativos da app", () => {
    expect(safeNextPath("/alterar-password")).toBe("/alterar-password");
    expect(safeNextPath("/player/minha-area?x=1")).toBe("/player/minha-area?x=1");
  });
  it("rejeita URLs absolutas e protocol-relative", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com/x")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
  it("vazio ou ausente → /", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});

describe("página de recuperação (UX-02)", () => {
  it("existe, usa resetPasswordForEmail e responde igual exista ou não o email", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const path = await import("node:path");
    const f = path.join(__dirname, "..", "..", "app/(auth)/recuperar-password/page.tsx");
    expect(existsSync(f)).toBe(true);
    const src = readFileSync(f, "utf8");
    expect(src).toContain("resetPasswordForEmail");
    expect(src).toContain("Se esse endereço tiver uma conta");
    expect(existsSync(path.join(__dirname, "..", "..", "app/auth/callback/route.ts"))).toBe(true);
  });
});

describe("safeNextPath com caracteres de controlo (revisão A.2, Imp. 1)", () => {
  it("rejeita tab/newline que o URL parser remove (\"/\\t/evil.com\" → https://evil.com)", () => {
    expect(safeNextPath("/\t/evil.com")).toBe("/");
    expect(safeNextPath("/\n/evil.com")).toBe("/");
    expect(safeNextPath("/\r//evil.com")).toBe("/");
  });
  it("o resultado resolve sempre para a própria origem", () => {
    for (const n of ["/alterar-password", "/\t/evil.com", "/%2F%2Fevil.com", "/a/../../b"]) {
      expect(new URL(safeNextPath(n), "https://app.test").origin).toBe("https://app.test");
    }
  });
});
