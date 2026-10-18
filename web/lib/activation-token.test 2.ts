import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createActivationToken, verifyActivationToken } from "./activation-token";

describe("segredo dos tokens de ativação", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-exposta");
    vi.stubEnv("ACTIVATION_SECRET", "segredo-dedicado-com-32-bytes-ou-mais!!");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("aceita um token criado com o segredo dedicado", () => {
    const t = createActivationToken("user-1");
    expect(verifyActivationToken(t)).toEqual({ ok: true, userId: "user-1" });
  });

  it("rejeita um token forjado com a service role key (SEC-11)", () => {
    const payload = `user-1:${Date.now() + 60_000}`;
    const sig = createHmac("sha256", "service-role-exposta").update(payload).digest("hex");
    const forged = Buffer.from(`${payload}:${sig}`).toString("base64url");
    expect(verifyActivationToken(forged)).toEqual({ ok: false, reason: "invalid" });
  });

  it("em produção sem ACTIVATION_SECRET recusa criar tokens", () => {
    vi.stubEnv("ACTIVATION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createActivationToken("user-1")).toThrow(/ACTIVATION_SECRET/);
  });
});

import { isActivationConfigured } from "./activation-token";

describe("isActivationConfigured (revisão final, Importante 6)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("falso em produção sem ACTIVATION_SECRET — validar antes de criar a conta", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACTIVATION_SECRET", "");
    expect(isActivationConfigured()).toBe(false);
  });
  it("verdadeiro com ACTIVATION_SECRET definido", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACTIVATION_SECRET", "segredo");
    expect(isActivationConfigured()).toBe(true);
  });
  it("verdadeiro em desenvolvimento (segredo de dev)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ACTIVATION_SECRET", "");
    expect(isActivationConfigured()).toBe(true);
  });
});
