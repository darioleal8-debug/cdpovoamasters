import { describe, expect, it, vi } from "vitest";
import { chooseInstallView, detectPlatform } from "./pwa-platform";
import { buildLigaServiceWorker } from "./pwa-sw";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
  ipadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("iPhone Safari", () => {
    expect(detectPlatform(UA.iphoneSafari, 5)).toEqual({ platform: "ios-safari", deviceLabel: "iPhone" });
  });
  it("iPhone Chrome → concluir no Safari", () => {
    expect(detectPlatform(UA.iphoneChrome, 5)).toMatchObject({ platform: "ios-other", iosBrowser: "chrome" });
  });
  it("iPhone dentro do Instagram", () => {
    expect(detectPlatform(UA.iphoneInstagram, 5).platform).toBe("ios-inapp");
  });
  it("iPadOS (UA de Mac com ecrã tátil)", () => {
    expect(detectPlatform(UA.ipadOS, 5)).toEqual({ platform: "ios-safari", deviceLabel: "iPad" });
  });
  it("Android Chrome e WebView", () => {
    expect(detectPlatform(UA.androidChrome).platform).toBe("android");
    expect(detectPlatform(UA.androidWebView).platform).toBe("android-inapp");
  });
  it("desktop não é mobile", () => {
    expect(detectPlatform(UA.macSafari, 0).platform).toBe("desktop");
    expect(detectPlatform(UA.windowsChrome).platform).toBe("desktop");
  });
});

describe("chooseInstallView", () => {
  it("Android: nativo quando disponível, manual caso contrário", () => {
    expect(chooseInstallView("android", true)).toBe("android-native");
    expect(chooseInstallView("android", false)).toBe("android-manual");
  });
  it("iOS", () => {
    expect(chooseInstallView("ios-safari", false)).toBe("ios-safari");
    expect(chooseInstallView("ios-other", false)).toBe("ios-open-safari");
    expect(chooseInstallView("ios-inapp", false)).toBe("open-browser");
  });
});

// ── Service Worker: executa o código gerado num "self" simulado ──────────────
type Handler = (e: unknown) => void;

function loadSw(fetchImpl: (r: Request) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name)!;
      return {
        match: async (r: Request | string) => m.get(typeof r === "string" ? new URL(r, "https://hoophub.pt").href : r.url)?.clone(),
        put: async (r: Request, res: Response) => { m.set(r.url, res); },
        addAll: async (rs: Request[]) => { for (const r of rs) m.set(r.url, new Response("cached:" + r.url)); },
        keys: async () => [...m.keys()].map((u) => new Request(u)),
        delete: async (r: Request) => m.delete(r.url),
      };
    },
    match: async (u: string) => {
      const href = new URL(u, "https://hoophub.pt").href;
      for (const m of store.values()) if (m.has(href)) return m.get(href)!.clone();
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
  };
  const self = {
    location: { origin: "https://hoophub.pt" },
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    registration: {},
  };
  // No SW real, Request aceita URLs relativos ao origin
  const SwRequest = class extends Request {
    constructor(u: string, init?: RequestInit) { super(new URL(u, self.location.origin).href, init); }
  };
  new Function("self", "caches", "fetch", "Request", buildLigaServiceWorker("test"))(self, caches, fetchImpl, SwRequest);

  async function dispatchFetch(url: string, mode: RequestMode = "cors", method = "GET") {
    let responded: Promise<Response> | undefined;
    const request = { url, mode, method } as unknown as Request;
    handlers.fetch({ request, preloadResponse: Promise.resolve(undefined), respondWith: (p: Promise<Response>) => { responded = p; } });
    return responded ? await responded : undefined;
  }
  async function install() {
    let p: Promise<unknown> | undefined;
    handlers.install({ waitUntil: (x: Promise<unknown>) => { p = x; } });
    await p;
  }
  return { dispatchFetch, install, store, self };
}

describe("service worker da Liga", () => {
  it("o código gerado é JavaScript válido", () => {
    expect(() => new Function(buildLigaServiceWorker("abc"))).not.toThrow();
  });

  it("páginas da Liga vêm sempre da rede", async () => {
    const fetchImpl = vi.fn(async () => new Response("fresh"));
    const sw = loadSw(fetchImpl);
    const res = await sw.dispatchFetch("https://hoophub.pt/liga-inatel/classificacao", "navigate");
    expect(await res!.text()).toBe("fresh");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sem rede mostra a página offline (nunca dados antigos)", async () => {
    const sw = loadSw(async () => { throw new TypeError("offline"); });
    await sw.install();
    const res = await sw.dispatchFetch("https://hoophub.pt/liga-inatel/resultados", "navigate");
    expect(await res!.text()).toContain("/liga-inatel-offline.html");
  });

  it("não interceta API, Supabase nem pedidos RSC", async () => {
    const sw = loadSw(async () => new Response("x"));
    expect(await sw.dispatchFetch("https://hoophub.pt/api/liga/track", "cors", "POST")).toBeUndefined();
    expect(await sw.dispatchFetch("https://hoophub.pt/api/liga/games")).toBeUndefined();
    expect(await sw.dispatchFetch("https://abc.supabase.co/rest/v1/league_games")).toBeUndefined();
    expect(await sw.dispatchFetch("https://hoophub.pt/liga-inatel/calendario?_rsc=1")).toBeUndefined();
  });

  it("não interceta navegação fora da Liga (HoopHub)", async () => {
    const sw = loadSw(async () => new Response("x"));
    expect(await sw.dispatchFetch("https://hoophub.pt/dashboard", "navigate")).toBeUndefined();
  });

  it("guarda em cache só os ficheiros estáticos imutáveis", async () => {
    const fetchImpl = vi.fn(async () => {
      const r = new Response("chunk");
      Object.defineProperty(r, "type", { value: "basic" });
      return r;
    });
    const sw = loadSw(fetchImpl);
    const url = "https://hoophub.pt/_next/static/chunks/app-123.js";
    await sw.dispatchFetch(url);
    await new Promise((r) => setTimeout(r, 0));
    const res = await sw.dispatchFetch(url);
    expect(await res!.text()).toBe("chunk");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
