"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isGameLiveNow } from "@/lib/time/club-time";

/**
 * Sinal "LIVE" a piscar, visível só entre a hora de início do jogo e 1h30 depois.
 * Calculado no browser (a página é cacheada no servidor) e reavaliado a cada 20s,
 * para aparecer e desaparecer sozinho sem recarregar a página.
 * Fora da janela mostra `fallback` (ou nada).
 */
export function LiveBadge({
  date,
  time,
  disabled = false,
  variant = "orange",
  fallback = null,
}: {
  date: string;
  time: string | null | undefined;
  /** ex.: jogo já com resultado aprovado */
  disabled?: boolean;
  /** "orange" para fundos claros/escuros; "dark" para colocar sobre fundo laranja */
  variant?: "orange" | "dark";
  fallback?: ReactNode;
}) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (disabled || !time) { setLive(false); return; }
    const check = () => setLive(isGameLiveNow(date, time));
    check();
    const id = window.setInterval(check, 20_000);
    return () => window.clearInterval(id);
  }, [date, time, disabled]);

  if (!live) return <>{fallback}</>;

  const dark = variant === "dark";
  return (
    <span
      className="live-badge"
      role="status"
      aria-label="Jogo a decorrer — em direto"
      title="Jogo a decorrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: dark ? "#15110E" : "#DC2626",
        color: "#FFFFFF",
        borderRadius: "4px",
        padding: "3px 7px",
        fontFamily: "var(--font-ibm-mono, monospace)",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span className="live-badge-dot" aria-hidden="true" />
      LIVE
    </span>
  );
}
