"use client";

/** Notificações push do HoopHub no browser (dispositivo do utilizador com sessão). */

const SW_URL = "/hoophub-sw.js";

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    && Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad: o push só existe na app instalada no ecrã principal. */
export function needsIosInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !isStandalone();
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  if (reg.active) return reg;
  const sw = reg.installing ?? reg.waiting;
  if (sw) {
    await new Promise<void>((resolve) => {
      if (sw.state === "activated") return resolve();
      sw.addEventListener("statechange", () => { if (sw.state === "activated") resolve(); });
    });
  }
  return reg;
}

/** Subscreve (ou recupera) este dispositivo e regista-o na conta com sessão. */
export async function subscribeThisDevice(): Promise<boolean> {
  try {
    if (!pushSupported()) return false;
    const reg = await activeRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Terminar sessão: este dispositivo deixa de receber as notificações desta conta (melhor esforço). */
export async function unsubscribeThisDevice(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch { /* nunca bloqueia o logout */ }
}
