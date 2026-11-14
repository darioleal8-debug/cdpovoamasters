"use client";

import { useEffect, useState } from "react";

const RELOAD_KEY = "liga-error-reload";

/** Limpa o service worker e as caches da Liga (resolve ficheiros antigos após uma atualização). */
async function resetLigaApp() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).filter((k) => k.startsWith("liga-inatel-")).map((k) => caches.delete(k)));
  } catch { /* melhor esforço */ }
}

export default function LigaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [busy, setBusy] = useState(false);
  const stale = /ChunkLoadError|Loading chunk|Failed to fetch dynamically|Importing a module script failed|hydrat/i.test(`${error.name} ${error.message}`);

  // Falha típica de ficheiros antigos em cache: recupera sozinho (uma única vez por sessão)
  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, "1");
    } catch { return; }
    resetLigaApp().then(() => window.location.reload());
  }, [stale]);

  async function hardReload() {
    setBusy(true);
    await resetLigaApp();
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    window.location.reload();
  }

  return (
    <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Ocorreu um erro</h1>
        <p style={{ fontSize: 14, opacity: 0.8, margin: "0 0 16px" }}>
          Não foi possível carregar esta página. Tenta novamente; se continuar, usa &ldquo;Limpar e recarregar&rdquo;.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={reset} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid currentColor", background: "transparent", cursor: "pointer" }}>
            Tentar novamente
          </button>
          <button type="button" onClick={hardReload} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", cursor: "pointer" }}>
            {busy ? "A limpar…" : "Limpar e recarregar"}
          </button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, marginTop: 16, wordBreak: "break-word" }}>
          {error.digest ? `Ref.: ${error.digest} · ` : ""}{error.message?.slice(0, 160)}
        </p>
      </div>
    </main>
  );
}
