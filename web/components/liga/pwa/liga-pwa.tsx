"use client";

import { useEffect } from "react";
import { clearJustInstalled, startLigaPwa, useLigaPwa } from "@/lib/liga/pwa-store";
import { InstallModal } from "./install-modal";

const SW_URL = "/liga-inatel-sw.js";
const SW_SCOPE = "/liga-inatel";

/** Regista o Service Worker da Liga (scope /liga-inatel) e verifica atualizações. */
function useLigaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let reg: ServiceWorkerRegistration | undefined;
    let lastCheck = Date.now();

    const register = () => {
      navigator.serviceWorker
        .register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" })
        .then((r) => { reg = r; })
        .catch(() => { /* sem SW a app continua a funcionar online */ });
    };

    // Verifica nova versão quando a app volta ao primeiro plano (no máx. 1x/30 min)
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !reg) return;
      if (Date.now() - lastCheck < 30 * 60 * 1000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

function InstalledToast() {
  const { justInstalled } = useLigaPwa();
  useEffect(() => {
    if (!justInstalled) return;
    const t = setTimeout(clearJustInstalled, 5000);
    return () => clearTimeout(t);
  }, [justInstalled]);
  if (!justInstalled) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))", zIndex: 1001,
        maxWidth: 440, margin: "0 auto",
        background: "#15110E", color: "#F6F2EC", border: "1px solid rgba(249,115,22,.45)",
        borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
      }}
    >
      <img src="/pwa/liga-inatel-192.png" alt="" width={36} height={36} style={{ borderRadius: 9 }} />
      <span style={{ fontSize: 14, lineHeight: 1.35 }}>
        <strong>Liga INATEL instalada.</strong> Já a podes abrir a partir do ecrã principal.
      </span>
    </div>
  );
}

/** Montado uma vez no layout da Liga INATEL. */
export function LigaPwa() {
  useLigaServiceWorker();
  useEffect(() => startLigaPwa(), []);
  return (
    <>
      <InstallModal />
      <InstalledToast />
    </>
  );
}
