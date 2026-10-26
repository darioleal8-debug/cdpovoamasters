"use client";

import { useState } from "react";

type PlayerStat = {
  nome: string;
  side: "home" | "away";
  numero: number | null;
  pontos: number;
  triplos: number;
  lances_livres: number;
  faltas: number;
};

interface Props {
  homeName: string;
  awayName: string;
  stats: PlayerStat[];
}

const TH: React.CSSProperties = {
  fontFamily: "var(--font-ibm-mono, monospace)",
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted-foreground, #8C837A)",
  fontWeight: 600,
  padding: "6px 8px",
  textAlign: "right",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border, #E9E2D8)",
};

const TD: React.CSSProperties = {
  padding: "7px 8px",
  fontSize: "13px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid var(--border, #E9E2D8)",
  color: "var(--foreground, #1A1612)",
};

export function PlayerStatsTabs({ homeName, awayName, stats }: Props) {
  const [tab, setTab] = useState<"home" | "away">("home");

  const home = stats.filter((s) => s.side === "home").sort((a, b) => b.pontos - a.pontos);
  const away = stats.filter((s) => s.side === "away").sort((a, b) => b.pontos - a.pontos);
  const rows = tab === "home" ? home : away;

  if (stats.length === 0) return null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px",
    fontSize: "12px",
    fontFamily: "var(--font-barlow-condensed, sans-serif)",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    border: "none",
    cursor: "pointer",
    background: active ? "var(--foreground, #1A1612)" : "transparent",
    color: active ? "var(--background, #FFFDF9)" : "var(--muted-foreground, #8C837A)",
    borderRadius: "6px",
    transition: "background 0.15s, color 0.15s",
  });

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px", background: "var(--muted, #F3EDE5)", borderRadius: "8px", padding: "3px" }}>
        <button style={tabStyle(tab === "home")} onClick={() => setTab("home")}>
          {homeName}
        </button>
        <button style={tabStyle(tab === "away")} onClick={() => setTab("away")}>
          {awayName}
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left" }}>#</th>
              <th style={{ ...TH, textAlign: "left", paddingLeft: "0" }}>Jogador</th>
              <th style={TH}>Pts</th>
              <th style={TH}>3P</th>
              <th style={TH}>LL</th>
              <th style={TH}>Fts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i}>
                <td style={{ ...TD, textAlign: "left", color: "var(--muted-foreground, #8C837A)", fontSize: "12px" }}>
                  {p.numero ?? "—"}
                </td>
                <td style={{ ...TD, textAlign: "left", paddingLeft: "0", fontWeight: p.pontos > 0 ? 600 : 400 }}>
                  {p.nome}
                </td>
                <td style={{ ...TD, fontWeight: 700, color: p.pontos > 0 ? "var(--foreground, #1A1612)" : "var(--muted-foreground, #8C837A)" }}>
                  {p.pontos}
                </td>
                <td style={{ ...TD, color: p.triplos > 0 ? "var(--foreground, #1A1612)" : "var(--muted-foreground, #8C837A)" }}>
                  {p.triplos}
                </td>
                <td style={{ ...TD, color: p.lances_livres > 0 ? "var(--foreground, #1A1612)" : "var(--muted-foreground, #8C837A)" }}>
                  {p.lances_livres}
                </td>
                <td style={{ ...TD, color: p.faltas > 0 ? "#EF4444" : "var(--muted-foreground, #8C837A)" }}>
                  {p.faltas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
