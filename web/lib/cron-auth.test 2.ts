import { describe, it, expect, afterEach, vi } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

const req = (auth?: string) => new Request("https://x/api/cron/late-payments", { headers: auth ? { authorization: auth } : {} });

describe("isAuthorizedCron", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("falha fechado quando CRON_SECRET não está definido", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCron(req("Bearer qualquer"))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });
  it("rejeita segredo errado ou ausente", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedCron(req("Bearer errado"))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });
  it("aceita o segredo certo", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedCron(req("Bearer s3cret"))).toBe(true);
  });
});
