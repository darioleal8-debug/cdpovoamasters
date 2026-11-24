import { describe, it, expect } from "vitest";
import { buildHoopHubServiceWorker } from "./hoophub-sw";

describe("service worker do HoopHub (só push)", () => {
  const sw = buildHoopHubServiceWorker("abc123");

  it("trata push e clique na notificação", () => {
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
  });
  it("não intercepta pedidos nem usa cache (a app continua a funcionar como antes)", () => {
    expect(sw).not.toContain('addEventListener("fetch"');
    expect(sw).not.toContain("caches.");
  });
  it("só abre caminhos do próprio site", () => {
    expect(sw).toContain('d.url.startsWith("/") && !d.url.startsWith("//")');
  });
  it("inclui a versão (muda a cada deploy)", () => {
    expect(sw).toContain("v" + "abc123");
  });
  it("é JavaScript válido", () => {
    expect(() => new Function(sw)).not.toThrow();
  });
});
