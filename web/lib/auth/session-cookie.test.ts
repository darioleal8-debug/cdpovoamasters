import { describe, it, expect } from "vitest";
import { hasSessionCookie, shouldRedirectFromLogin } from "./session-cookie";

describe("hasSessionCookie", () => {
  it("reconhece o cookie inteiro de qualquer projeto", () => {
    expect(hasSessionCookie([{ name: "sb-abcdef-auth-token", value: "x" }])).toBe(true);
  });
  it("reconhece cookies divididos (.0/.1) de sessões grandes", () => {
    expect(hasSessionCookie([{ name: "sb-abcdef-auth-token.0", value: "x" }, { name: "sb-abcdef-auth-token.1", value: "y" }])).toBe(true);
  });
  it("ignora cookies vazios e de outros serviços", () => {
    expect(hasSessionCookie([{ name: "sb-abcdef-auth-token", value: "" }, { name: "theme", value: "dark" }])).toBe(false);
  });
  it("ignora o code-verifier do PKCE", () => {
    expect(hasSessionCookie([{ name: "sb-abcdef-auth-token-code-verifier", value: "v" }])).toBe(false);
  });
});

describe("shouldRedirectFromLogin", () => {
  it("redireciona sessões ativas para o dashboard", () => {
    expect(shouldRedirectFromLogin(true, new URLSearchParams(""))).toBe(true);
  });
  it("não redireciona quando a conta foi desativada (quebra o ciclo de redireções)", () => {
    expect(shouldRedirectFromLogin(true, new URLSearchParams("reason=inactive"))).toBe(false);
  });
  it("não redireciona sem sessão", () => {
    expect(shouldRedirectFromLogin(false, new URLSearchParams(""))).toBe(false);
  });
});
