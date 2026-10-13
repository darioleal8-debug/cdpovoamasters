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
