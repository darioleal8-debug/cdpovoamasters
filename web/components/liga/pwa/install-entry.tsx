"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { canOfferInstall, openInstallModal, useLigaPwa } from "@/lib/liga/pwa-store";
import { PhoneInstallIcon } from "./install-icons";

const HEAVY = "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))";
const TITLE = "Instalar Liga INATEL";
const SUBTITLE = "Adiciona a competição ao ecrã principal do teu telemóvel e acompanha tudo num só toque.";

/** Botão destacado no menu mobile da Liga INATEL. */
export function InstallMenuItem({ onOpen }: { onOpen?: () => void }) {
  const s = useLigaPwa();
  if (!canOfferInstall(s)) return null;
  return (
    <button
      type="button"
      onClick={() => { onOpen?.(); openInstallModal(); }}
      style={{
        marginTop: 20, width: "100%", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", borderRadius: 10,
        background: "rgba(249,115,22,.1)", border: "1.5px solid rgba(249,115,22,.55)",
        color: "#F6F2EC",
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0, width: 42, height: 42, borderRadius: 10, background: "#F97316", color: "#15110E",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <PhoneInstallIcon size={22} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: HEAVY, fontWeight: 800, fontSize: 15, letterSpacing: "0.07em", textTransform: "uppercase", color: "#F97316" }}>
          {TITLE}
        </span>
        <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.4, color: "#B9AFA4", marginTop: 2 }}>
          {SUBTITLE}
        </span>
      </span>
    </button>
  );
}

const DISMISS_KEY = "hh_liga_pwa_banner_dismissed";
const DISMISS_DAYS = 30;

/** Banner discreto na página inicial da Liga (só mobile, pode ser fechado). */
export function InstallBanner() {
  const s = useLigaPwa();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() - ts < DISMISS_DAYS * 86_400_000);
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || !canOfferInstall(s)) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div style={{ padding: "16px 20px 0", maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#15110E", color: "#F6F2EC",
          border: "1px solid rgba(249,115,22,.35)", borderRadius: 10,
          padding: "10px 6px 10px 12px",
        }}
      >
        <img src="/pwa/liga-inatel-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
        <button
          type="button"
          onClick={openInstallModal}
          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: 0, padding: 0, color: "inherit", cursor: "pointer" }}
        >
          <span style={{ display: "block", fontFamily: HEAVY, fontWeight: 800, fontSize: 14, letterSpacing: "0.07em", textTransform: "uppercase", color: "#F97316" }}>
            {TITLE}
          </span>
          <span style={{ display: "block", fontSize: 12, lineHeight: 1.35, color: "#B9AFA4", marginTop: 1 }}>
            Acompanha tudo num só toque, a partir do ecrã principal.
          </span>
        </button>
        <button
          type="button"
          onClick={openInstallModal}
          style={{
            flexShrink: 0, minHeight: 36, padding: "0 12px", borderRadius: 6, border: 0,
            background: "#F97316", color: "#15110E", cursor: "pointer",
            fontFamily: HEAVY, fontWeight: 800, fontSize: 12, letterSpacing: "0.07em", textTransform: "uppercase",
          }}
        >
          Instalar
        </button>
        <button
          type="button"
          aria-label="Fechar convite de instalação"
          onClick={dismiss}
          style={{
            flexShrink: 0, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: 0, color: "#8C837A", cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
