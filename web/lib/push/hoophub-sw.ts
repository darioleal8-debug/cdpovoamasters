// Service Worker do HoopHub (scope "/") — SÓ notificações push.
// Sem handler de "fetch": não intercepta nem guarda em cache nenhum pedido (o comportamento da app não muda).
// O Service Worker da Liga INATEL (scope /liga-inatel) continua a ser o dono dessas páginas.

export function buildHoopHubServiceWorker(version: string): string {
  return `/* HoopHub — service worker (push) v${version} */
"use strict";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  // Só caminhos do próprio site
  const url = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/dashboard";
  event.waitUntil(self.registration.showNotification(d.title || "HoopHub", {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: d.tag || undefined,
    renotify: false,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && "focus" in c) {
        try { await c.focus(); if ("navigate" in c) await c.navigate(target); return; } catch (e) {}
      }
    }
    await self.clients.openWindow(target);
  })());
});
`;
}
