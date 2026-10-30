"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { chooseInstallView, type InstallView } from "@/lib/liga/pwa-platform";
import { closeInstallModal, runNativeInstall, useLigaPwa } from "@/lib/liga/pwa-store";
import { CompassIcon, IosAddIcon, IosShareIcon, KebabIcon, PhoneInstallIcon } from "./install-icons";

const HEAVY = "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))";

type Step = { icon: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode };

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => (
        <li
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#FFFDFA", border: "1px solid #E6DED3", borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <span
            aria-hidden
            style={{
              flexShrink: 0, width: 26, height: 26, borderRadius: "50%",
              background: "#F97316", color: "#15110E",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: HEAVY, fontWeight: 800, fontSize: 14,
            }}
          >
            {i + 1}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, lineHeight: 1.35, color: "#1A1612" }}>{s.title}</span>
            {s.hint && <span style={{ display: "block", fontSize: 12.5, color: "#6F675F", marginTop: 3, lineHeight: 1.4 }}>{s.hint}</span>}
          </span>
          <span
            aria-hidden
            style={{
              flexShrink: 0, minWidth: 42, height: 42, padding: "0 8px", boxSizing: "border-box", borderRadius: 10,
              background: "#F4EFE8", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {s.icon}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Pílula que imita um botão do sistema (ex.: "Adicionar") */
function Pill({ children, color = "#0A84FF" }: { children: React.ReactNode; color?: string }) {
  return <span style={{ fontWeight: 600, fontSize: 12, color }}>{children}</span>;
}

const strong = (t: string) => <strong style={{ fontWeight: 700 }}>{t}</strong>;

function CopyLink() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}/liga-inatel`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback para browsers sem Clipboard API
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <button type="button" onClick={copy} style={secondaryBtn}>
      {copied ? "Link copiado ✓" : "Copiar link da Liga INATEL"}
    </button>
  );
}

const primaryBtn: React.CSSProperties = {
  width: "100%", minHeight: 50, border: 0, borderRadius: 8,
  background: "#F97316", color: "#15110E", cursor: "pointer",
  fontFamily: HEAVY, fontWeight: 800, fontSize: 15, letterSpacing: "0.07em", textTransform: "uppercase",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
};

const secondaryBtn: React.CSSProperties = {
  width: "100%", minHeight: 46, borderRadius: 8, cursor: "pointer",
  background: "transparent", border: "1.5px solid #15110E", color: "#15110E",
  fontFamily: HEAVY, fontWeight: 800, fontSize: 13, letterSpacing: "0.07em", textTransform: "uppercase",
};

function Body({ view, deviceLabel, iosBrowser }: { view: InstallView; deviceLabel: string; iosBrowser?: string }) {
  const s = useLigaPwa();

  if (view === "android-native") {
    return (
      <button
        type="button"
        style={{ ...primaryBtn, opacity: s.installing ? 0.7 : 1 }}
        disabled={s.installing}
        onClick={() => { void runNativeInstall(); }}
      >
        <PhoneInstallIcon size={20} />
        {s.installing ? "A instalar…" : "Adicionar ao ecrã principal"}
      </button>
    );
  }

  if (view === "android-manual") {
    return (
      <Steps
        steps={[
          { icon: <KebabIcon />, title: <>Toca no menu {strong("⋮")} do browser</>, hint: "No Chrome fica no canto superior direito." },
          { icon: <PhoneInstallIcon color="#1A1612" />, title: <>Escolhe {strong("Instalar aplicação")} ou {strong("Adicionar ao ecrã principal")}</> },
          { icon: <Pill color="#1A73E8">Instalar</Pill>, title: <>Confirma em {strong("Instalar")}</> },
        ]}
      />
    );
  }

  if (view === "ios-safari") {
    return (
      <Steps
        steps={[
          {
            icon: <IosShareIcon />,
            title: <>Abre o botão {strong("Partilhar")} do Safari</>,
            hint: deviceLabel === "iPad"
              ? "Fica no topo do ecrã, junto à barra de endereço."
              : "Fica na barra inferior. Nas versões mais recentes do iOS, toca primeiro em ⋯",
          },
          { icon: <IosAddIcon />, title: <>Seleciona {strong("Adicionar ao ecrã principal")}</>, hint: "Se não aparecer, desliza a lista de opções para baixo." },
          { icon: <Pill>Adicionar</Pill>, title: <>Confirma em {strong("Adicionar")}</>, hint: "O ícone da Liga INATEL aparece no ecrã principal." },
        ]}
      />
    );
  }

  if (view === "ios-open-safari") {
    const browser = iosBrowser === "chrome" ? "no Chrome" : iosBrowser === "firefox" ? "no Firefox" : iosBrowser === "edge" ? "no Edge" : "neste browser";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Steps
          steps={[
            { icon: <CompassIcon />, title: <>Abre esta página no {strong("Safari")}</>, hint: `No ${deviceLabel}, a instalação tem de ser concluída no Safari (não ${browser}).` },
            { icon: <IosShareIcon />, title: <>No Safari, toca em {strong("Partilhar")}</> },
            { icon: <IosAddIcon />, title: <>Escolhe {strong("Adicionar ao ecrã principal")} e confirma</> },
          ]}
        />
        <CopyLink />
        {iosBrowser === "chrome" && (
          <p style={{ margin: 0, fontSize: 12.5, color: "#6F675F", lineHeight: 1.45 }}>
            Em versões recentes do Chrome também podes tentar diretamente: ícone Partilhar na barra de endereço › Adicionar ao ecrã principal.
          </p>
        )}
      </div>
    );
  }

  // Dentro de outra app (Instagram, Facebook…): não é possível instalar daqui
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Steps
        steps={[
          { icon: <CompassIcon />, title: <>Abre esta página no {strong(deviceLabel === "telemóvel" ? "Chrome" : "Safari")}</>, hint: "Usa o menu desta app (⋯) › Abrir no browser, ou copia o link." },
          { icon: <PhoneInstallIcon color="#1A1612" />, title: <>Toca de novo em {strong("Instalar Liga INATEL")}</> },
        ]}
      />
      <CopyLink />
    </div>
  );
}

export function InstallModal() {
  const s = useLigaPwa();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!s.modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeInstallModal(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [s.modalOpen]);

  if (!s.modalOpen || !s.info) return null;

  const view = chooseInstallView(s.info.platform, !!s.deferred);
  const iosTitle = view === "ios-safari" || view === "ios-open-safari";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) closeInstallModal(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,8,6,.62)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "ligaFade .18s ease-out",
      }}
    >
      <style>{`
        @keyframes ligaFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ligaUp { from { transform: translateY(24px); opacity: .6 } to { transform: none; opacity: 1 } }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="liga-install-title"
        style={{
          width: "100%", maxWidth: 480, maxHeight: "92dvh", overflowY: "auto",
          background: "#F4EFE8", color: "#1A1612",
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 -12px 40px rgba(0,0,0,.35)",
          animation: "ligaUp .22s ease-out",
        }}
      >
        {/* Cabeçalho escuro com o ícone da app */}
        <div style={{ position: "relative", background: "#15110E", color: "#F6F2EC", padding: "22px 20px 20px", borderBottom: "3px solid #F97316" }}>
          <button
            ref={closeRef}
            type="button"
            aria-label="Fechar"
            onClick={closeInstallModal}
            style={{
              position: "absolute", top: 10, right: 10, width: 40, height: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(246,242,236,.08)", border: 0, borderRadius: "50%", color: "#F6F2EC", cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 36 }}>
            <img
              src="/pwa/liga-inatel-192.png"
              alt=""
              width={60}
              height={60}
              style={{ borderRadius: 14, flexShrink: 0, boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}
            />
            <div>
              <h2 id="liga-install-title" style={{ margin: 0, fontFamily: HEAVY, fontWeight: 800, fontSize: 21, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.1 }}>
                {iosTitle ? `Instala a Liga INATEL no teu ${s.info.deviceLabel}` : "Leva a Liga INATEL contigo!"}
              </h2>
              <p style={{ margin: "4px 0 0", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B9AFA4" }}>
                Liga INATEL · app
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 20px calc(22px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "#3A332D" }}>
            {iosTitle && <><strong style={{ fontFamily: HEAVY, letterSpacing: "0.04em", textTransform: "uppercase" }}>Leva a Liga INATEL contigo!</strong>{" "}</>}
            Instala a aplicação no teu telemóvel e acompanha os jogos, resultados, classificações e estatísticas da competição.
          </p>
          <Body view={view} deviceLabel={s.info.deviceLabel} iosBrowser={s.info.iosBrowser} />
        </div>
      </div>
    </div>
  );
}
