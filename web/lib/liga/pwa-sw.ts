// Código do Service Worker da app Liga INATEL (ver app/liga-inatel-sw.js/route.ts).

export function buildLigaServiceWorker(version: string): string {
  return `/* Liga INATEL — service worker v${version} */
"use strict";
const VERSION = ${JSON.stringify(version)};
const CACHE_PREFIX = "liga-inatel-";
const STATIC_CACHE = CACHE_PREFIX + "static-" + VERSION;
const OFFLINE_URL = "/liga-inatel-offline.html";
const PRECACHE = [OFFLINE_URL, "/pwa/liga-inatel-192.png"];
const MAX_STATIC_ENTRIES = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== STATIC_CACHE).map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa/");
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (!url.pathname.startsWith("/liga-inatel")) return;
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(req);
      } catch (e) {
        const offline = await caches.match(OFFLINE_URL);
        return offline || new Response("Sem ligação", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
      }
      return res;
    })());
  }
  // Restantes pedidos seguem diretamente para a rede (sem cache).
});
`;
}
