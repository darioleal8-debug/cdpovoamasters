"use client";

// ALL colors in hex — html2canvas cannot parse oklch()
// Never use CSS variables or oklch() in this file or its children.

import React, { forwardRef } from "react";
import type { GameSession, PlayByPlay } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import type { DerivedPlayerStats } from "@/lib/live/derive-stats";
import { formatClock } from "@/hooks/use-live-game";

// ── Palette (hex only) ────────────────────────────────────────────────────────
const C = {
  bg:         "#0d1825",
  panel:      "#162233",
  line:       "#263a52",
  text:       "#edf4ff",
  muted:      "#7898b8",
  accent:     "#1a7c43",
  accentTxt:  "#4ade80",
  win:        "#4ade80", winBg:  "#052e16",
  lose:       "#f87171", loseBg: "#3b0f0f",
  draw:       "#fbbf24", drawBg: "#3b2100",
};

const MONO = '"Courier New", Courier, monospace';
const SANS = 'Arial, Helvetica, sans-serif';

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ShareCardProps {
  session: GameSession;
  roster: PlayerWithUser[];
  plays: PlayByPlay[];
  playerMap: Map<string, DerivedPlayerStats>;
  clockSecs: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  function ShareCard({ session, roster, plays, playerMap, clockSecs }, ref) {

    // ── Aggregates ─────────────────────────────────────────────────────
    let totReb = 0, totAst = 0, totStl = 0, tot3pm = 0;
    for (const s of playerMap.values()) {
      totReb  += s.reb_off + s.reb_def;
      totAst  += s.ast;
      totStl  += s.stl;
      tot3pm  += s.fg3_made;
    }
    const awayReb = (session.away_reb_off ?? 0) + (session.away_reb_def ?? 0);

    const homeFouls = plays.filter(p =>
      p.is_home_team &&
      ["foul_def","foul_of","foul_anti","foul_committed","foul_tec"].includes(p.event_type)
    ).length;

    const registos = plays.filter(p =>
      !["game_start","game_end","period_start","period_end"].includes(p.event_type)
    ).length;

    // ── Top 3 scorers ───────────────────────────────────────────────────
    const topScorers = [...roster]
      .map(p => ({ p, s: playerMap.get(p.user_id) ?? null }))
      .filter(({ s }) => s !== null && s.pts > 0)
      .sort((a, b) => {
        const pd = (b.s?.pts ?? 0) - (a.s?.pts ?? 0);
        if (pd !== 0) return pd;
        return ((b.s?.reb_off ?? 0) + (b.s?.reb_def ?? 0)) - ((a.s?.reb_off ?? 0) + (a.s?.reb_def ?? 0));
      })
      .slice(0, 3);

    // ── Result badge ────────────────────────────────────────────────────
    const result =
      session.home_score > session.away_score ? "VITÓRIA" :
      session.home_score < session.away_score ? "DERROTA" : "EMPATE";
    const rColor = result === "VITÓRIA" ? C.win : result === "DERROTA" ? C.lose : C.draw;
    const rBg    = result === "VITÓRIA" ? C.winBg : result === "DERROTA" ? C.loseBg : C.drawBg;

    // ── Date ────────────────────────────────────────────────────────────
    const d = session.started_at ? new Date(session.started_at) : new Date();
    const gameDate = d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase();

    // ── Stat boxes ──────────────────────────────────────────────────────
    const boxes = [
      { label: "RESSALTOS",   value: totReb,  note: `Adv. ${awayReb}` },
      { label: "ASSISTÊNCIAS",value: totAst,  note: "" },
      { label: "ROUBOS",      value: totStl,  note: "" },
      { label: "TRIPLOS",     value: tot3pm,  note: "" },
    ];

    return (
      <div
        ref={ref}
        style={{
          width: 1080, height: 1350,
          background: C.bg,
          color: C.text,
          fontFamily: SANS,
          padding: "64px 60px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58, flexShrink: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, letterSpacing: "0.24em", color: C.muted, textTransform: "uppercase" }}>
            CD PÓVOA MASTERS
          </span>
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase" }}>
            {gameDate}
          </span>
        </div>

        {/* ── Accent line ──────────────────────────────────────────── */}
        <div style={{ height: 4, background: C.accent, borderRadius: 2, margin: "28px 0", flexShrink: 0 }} />

        {/* ── Score block ──────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, height: 248 }}>
          {/* Home */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>
              CD PÓVOA
            </span>
            <span style={{ fontFamily: MONO, fontSize: 158, fontWeight: 700, lineHeight: 0.88, color: C.text }}>
              {session.home_score}
            </span>
          </div>
          {/* Divider */}
          <div style={{ width: 72, textAlign: "center", paddingBottom: 32 }}>
            <span style={{ fontFamily: MONO, fontSize: 44, color: C.muted }}>:</span>
          </div>
          {/* Away */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>
              {(session.opponent_name ?? "ADVERSÁRIO").slice(0, 24).toUpperCase()}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 158, fontWeight: 700, lineHeight: 0.88, color: C.muted }}>
              {session.away_score}
            </span>
          </div>
        </div>

        {/* ── Result + period ──────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, height: 50, marginTop: 20, flexShrink: 0 }}>
          <span style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 800, letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: rColor, background: rBg, border: `1px solid ${rColor}`,
            borderRadius: 999, padding: "6px 18px",
          }}>
            ● {result}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted }}>
            {session.current_period}º PERÍODO · {formatClock(clockSecs)}
          </span>
        </div>

        {/* ── Separator ────────────────────────────────────────────── */}
        <div style={{ height: 1, background: C.line, margin: "36px 0", flexShrink: 0 }} />

        {/* ── Top scorers ──────────────────────────────────────────── */}
        <div style={{ flexShrink: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", color: C.accent, textTransform: "uppercase" }}>
            MELHORES MARCADORES
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
            {topScorers.length === 0 && (
              <div style={{
                background: C.panel, borderRadius: 12, padding: "14px 20px",
                fontFamily: SANS, fontSize: 14, color: C.muted,
              }}>
                Sem pontos registados
              </div>
            )}
            {topScorers.map(({ p, s }) => {
              const reb = (s?.reb_off ?? 0) + (s?.reb_def ?? 0);
              return (
                <div key={p.user_id} style={{
                  display: "flex", alignItems: "center",
                  background: C.panel, borderRadius: 12, padding: "16px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1 }}>
                    <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.muted }}>
                      #{p.jersey_number ?? "–"}
                    </span>
                    <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.text }}>
                      {p.user.name}
                    </span>
                  </div>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: C.muted, marginRight: 24, whiteSpace: "nowrap" }}>
                    {reb} res · {s?.ast ?? 0} ast
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 80, justifyContent: "flex-end" }}>
                    <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: C.accentTxt }}>
                      {s?.pts ?? 0}
                    </span>
                    <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: C.muted }}>
                      PTS
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Separator ────────────────────────────────────────────── */}
        <div style={{ height: 1, background: C.line, margin: "36px 0", flexShrink: 0 }} />

        {/* ── Team stat boxes ──────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
          {boxes.map(({ label, value, note }) => (
            <div key={label} style={{
              flex: 1, background: C.panel, borderRadius: 14, padding: "22px 20px",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: C.muted, textTransform: "uppercase" }}>
                {label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 52, fontWeight: 700, lineHeight: 1, color: C.text }}>
                {value}
              </span>
              {note && <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted }}>{note}</span>}
            </div>
          ))}
        </div>

        {/* ── Separator ────────────────────────────────────────────── */}
        <div style={{ height: 1, background: C.line, margin: "36px 0", flexShrink: 0 }} />

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58, flexShrink: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>
            FALTAS · {homeFouls}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted }}>
            {registos} registos
          </span>
          <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", color: C.accent }}>
            hoophub.pt
          </span>
        </div>
      </div>
    );
  }
);
