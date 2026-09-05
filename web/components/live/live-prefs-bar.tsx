"use client";

import type { LiveLayout, LivePrefs } from "@/hooks/use-live-prefs";
import { SANS } from "./tokens";

const MODES: { id: LiveLayout; label: string }[] = [
  { id: "a", label: "Jogador → ação" },
  { id: "b", label: "Ação → jogador" },
  { id: "c", label: "Folha de jogo" },
];

interface LivePrefsBarProps {
  prefs: LivePrefs;
  onSetLayout: (l: LiveLayout) => void;
  onSetDark: (d: boolean) => void;
  onToggleFullscreen: () => void;
  onOpenSummary: () => void;
  onOpenShare: () => void;
}

export function LivePrefsBar({ prefs, onSetLayout, onSetDark, onToggleFullscreen, onOpenSummary, onOpenShare }: LivePrefsBarProps) {
  const groupStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 4,
    background: "oklch(0.94 0.006 250)", borderRadius: 13, padding: 5,
  };
  const btnBase: React.CSSProperties = {
    fontFamily: SANS, fontSize: 12, fontWeight: 700,
    border: "none", cursor: "pointer", borderRadius: 9,
    padding: "0 12px", minHeight: 48, transition: "all 0.12s",
    letterSpacing: "0.01em",
  };
  const activeBtn: React.CSSProperties = {
    ...btnBase, background: "oklch(0.22 0.02 250)", color: "white",
  };
  const inactiveBtn: React.CSSProperties = {
    ...btnBase, background: "transparent", color: "oklch(0.4 0.02 250)",
  };
  const iconBtn: React.CSSProperties = {
    width: 48, height: 48, borderRadius: 10, cursor: "pointer",
    fontFamily: SANS, fontSize: 18, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.12s",
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 16px",
      background: "oklch(0.98 0.004 250)",
      borderBottom: "1px solid oklch(0.9 0.006 250)",
      fontFamily: SANS,
      flexWrap: "wrap",
    }}>
      {/* Left label */}
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "oklch(0.55 0.015 250)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
        MODO DE REGISTO
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.3 0.02 250)", whiteSpace: "nowrap" }}>
        {MODES.find(m => m.id === prefs.layout)?.label}
      </span>

      <div style={{ flex: 1 }} />

      {/* Mode buttons */}
      <div style={groupStyle}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => onSetLayout(m.id)}
            style={prefs.layout === m.id ? activeBtn : inactiveBtn}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Theme buttons */}
      <div style={groupStyle}>
        <button onClick={() => onSetDark(false)}
          style={!prefs.dark ? activeBtn : inactiveBtn} title="Tema claro">
          ☀ Claro
        </button>
        <button onClick={() => onSetDark(true)}
          style={prefs.dark ? activeBtn : inactiveBtn} title="Tema escuro">
          ☾ Escuro
        </button>
      </div>

      {/* Summary + share + fullscreen icon buttons */}
      <button onClick={onOpenSummary} title="Resumo estatístico"
        style={{
          ...iconBtn,
          background: "oklch(1 0 0)", border: "1px solid oklch(0.8 0.01 250)",
          color: "oklch(0.3 0.02 250)",
        }}>
        ▤
      </button>
      <button onClick={onOpenShare} title="Exportar resultado"
        style={{
          ...iconBtn,
          background: "oklch(0.33 0.1 145)", border: "none",
          color: "oklch(0.9 0.12 145)",
          fontSize: 14,
        }}>
        ↗
      </button>
      <button onClick={onToggleFullscreen} title="Ecrã cheio"
        style={{
          ...iconBtn,
          background: "oklch(0.22 0.02 250)", border: "none",
          color: "white",
        }}>
        ⤢
      </button>
    </div>
  );
}
