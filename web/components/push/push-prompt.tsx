"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { needsIosInstall, pushSupported, subscribeThisDevice } from "@/lib/push/client";

const DISMISS_KEY = "hh-push-dismissed-at";
const DISMISS_DAYS = 14;

type Mode = "hidden" | "ask" | "ios" | "denied" | "done";

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch { return false; }
}

/**
 * Convite para receber notificações de comunicados neste dispositivo.
 * O browser só deixa pedir permissão após um toque, por isso há sempre um botão.
 * Com a permissão já dada, mantém só a subscrição sincronizada (sem mostrar nada).
 * `showDenied`: mostra uma nota quando as notificações estão bloqueadas no browser.
 */
export function PushPrompt({ showDenied = false }: { showDenied?: boolean }) {
  const [mode, setMode] = useState<Mode>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      if (needsIosInstall() && !recentlyDismissed()) setMode("ios");
      return;
    }
    if (Notification.permission === "granted") { void subscribeThisDevice(); return; }
    if (Notification.permission === "denied") { setMode(showDenied ? "denied" : "hidden"); return; }
    if (!recentlyDismissed()) setMode("ask");
  }, [showDenied]);

  const enable = useCallback(async () => {
    setBusy(true);
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setMode((await subscribeThisDevice()) ? "done" : "hidden");
    } else {
      setMode(perm === "denied" && showDenied ? "denied" : "hidden");
    }
    setBusy(false);
  }, [showDenied]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sem storage */ }
    setMode("hidden");
  };

  if (mode === "hidden") return null;

  const box = "rounded-2xl p-4 flex items-start gap-3";
  const boxStyle = { background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.25)" };
  const text = { color: "var(--text,#0A1220)" };
  const muted = { color: "var(--muted-text,#5A6478)" };

  if (mode === "done") {
    return (
      <div role="status" className={box} style={boxStyle}>
        <Bell className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--action,#F97316)" }} />
        <p className="text-[13px] font-semibold" style={text}>Notificações ativadas neste dispositivo.</p>
      </div>
    );
  }

  if (mode === "denied") {
    return (
      <div className={box} style={{ background: "rgba(20,33,61,.04)", border: "1px solid var(--line,#E4E7EE)" }}>
        <BellOff className="mt-0.5 h-5 w-5 shrink-0" style={muted} />
        <p className="text-[13px] leading-snug" style={muted}>
          As notificações estão bloqueadas neste dispositivo. Ativa-as nas definições do browser (ou da app instalada) para seres avisado de novos comunicados.
        </p>
      </div>
    );
  }

  if (mode === "ios") {
    return (
      <div className={box} style={boxStyle}>
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--action,#F97316)" }} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={text}>Receber notificações no iPhone</p>
          <p className="mt-0.5 text-[12px] leading-snug" style={muted}>
            Instala primeiro o HoopHub: toca em Partilhar e depois em «Adicionar ao ecrã principal». Abre a app a partir do ícone para ativar as notificações.
          </p>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 text-[12px] font-semibold" style={muted}>Fechar</button>
      </div>
    );
  }

  return (
    <div className={box} style={boxStyle} role="region" aria-label="Notificações de comunicados">
      <Bell className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--action,#F97316)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold" style={text}>Receber notificações dos comunicados?</p>
        <p className="mt-0.5 text-[12px] leading-snug" style={muted}>
          Sê avisado no telemóvel assim que o treinador ou a direção publica um comunicado.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button" onClick={enable} disabled={busy}
            className="h-9 rounded-lg px-4 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--action,#F97316)" }}
          >
            {busy ? "A ativar…" : "Ativar notificações"}
          </button>
          <button type="button" onClick={dismiss} disabled={busy} className="h-9 rounded-lg px-3 text-[13px] font-semibold" style={muted}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
