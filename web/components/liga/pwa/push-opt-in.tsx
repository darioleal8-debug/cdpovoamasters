"use client";

import { useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "liga-push-dismissed";

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

/** Subscreve (ou recupera) a subscrição push e regista-a no servidor. */
async function subscribe(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
    }
    const res = await fetch("/api/liga/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pede para ativar notificações na app instalada (o browser só deixa pedir após um toque).
 * Se a permissão já foi dada, mantém a subscrição sincronizada com o servidor.
 */
export function PushOptIn() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supported()) return;
    if (Notification.permission === "granted") { void subscribe(); return; }
    if (Notification.permission !== "default" || !isStandalone()) return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch { /* sem storage */ }
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      const ok = await subscribe();
      setDone(ok);
      if (ok) setTimeout(() => setShow(false), 3500); else setShow(false);
    } else {
      setShow(false);
    }
    setBusy(false);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* sem storage */ }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div
      role="dialog"
      aria-label="Ativar notificações"
      style={{
        position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))", zIndex: 1001,
        maxWidth: 440, margin: "0 auto", background: "#15110E", color: "#F6F2EC",
        border: "1px solid rgba(249,115,22,.45)", borderRadius: 10, padding: "14px", boxShadow: "0 10px 30px rgba(0,0,0,.35)",
      }}
    >
      {done ? (
        <p style={{ margin: 0, fontSize: 14 }}><strong>Notificações ativadas.</strong> Vais saber quando os jogos começam e os resultados saem.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>Receber notificações?</p>
          <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.4, color: "#B9AFA4" }}>
            Aviso 15 minutos antes de cada jogo, resultados com a notícia e jornadas concluídas.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={enable} disabled={busy} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {busy ? "A ativar…" : "Ativar"}
            </button>
            <button onClick={dismiss} disabled={busy} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(249,115,22,.4)", background: "transparent", color: "#F6F2EC", fontSize: 14, cursor: "pointer" }}>
              Agora não
            </button>
          </div>
        </>
      )}
    </div>
  );
}
