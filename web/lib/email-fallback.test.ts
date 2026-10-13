import { describe, it, expect, afterEach, vi } from "vitest";
import { noEmailServiceResult } from "./email-fallback";

describe("noEmailServiceResult", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("em produção é uma falha (nunca marcar recibos/ativações como enviados)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(noEmailServiceResult()).toEqual({ success: false, devFallback: true, error: "Nenhum serviço de email configurado" });
  });
  it("em desenvolvimento devolve sucesso simulado", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(noEmailServiceResult()).toEqual({ success: true, devFallback: true });
  });
});
