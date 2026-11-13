import type { GameSession, PlayerGameStatsWithUser, GamePeriodScore } from "@/types/database";
import { toPeriodPartials } from "@/lib/live/period-scores";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PdfPlayer = PlayerGameStatsWithUser & { jersey_number?: number | null; seconds_played?: number };

/** Contexto opcional do jogo (competição, jornada, local…) para o cabeçalho. */
export interface PdfGameContext {
  competition?: string | null;   // ex.: "Liga INATEL"
  jornada?: number | null;
  serie?: string | null;
  eventDate?: string | null;     // YYYY-MM-DD
  eventTime?: string | null;     // HH:MM[:SS]
  location?: string | null;
  /** nome do clube (por omissão CD Póvoa) */
  clubName?: string | null;
  /** lado do clube no jogo (casa/fora) — só para o rótulo */
  isHome?: boolean | null;
}

type RGB = [number, number, number];
const NAVY: RGB = [15, 30, 53];
const NAVY_2: RGB = [28, 46, 76];
const ORANGE: RGB = [249, 115, 22];
const INK: RGB = [26, 22, 18];
const MUTED: RGB = [111, 103, 95];
const LINE: RGB = [228, 222, 213];
const ZEBRA: RGB = [248, 246, 242];
const TOTAL_BG: RGB = [255, 237, 220];
const GREEN: RGB = [21, 128, 61];
const RED: RGB = [220, 38, 38];
const WHITE: RGB = [255, 255, 255];

const pct = (m: number, a: number) => (a > 0 ? `${Math.round((m / a) * 100)}%` : "—");
const mins = (secs: number) => (secs ? `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}` : "0:00");
const shortName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] ?? "—";
};
const fmtLongDate = (d: string) => {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
};

/**
 * Desenha o box score num documento jsPDF (A4 horizontal). Separado de
 * generateGamePDF para poder ser testado/pré-visualizado fora do browser.
 */
export function renderBoxScore(
  doc: any,
  autoTable: (doc: any, opts: any) => void,
  session: GameSession,
  stats: PdfPlayer[],
  periodScores: GamePeriodScore[],
  ctx: PdfGameContext = {}
): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12; // margem
  const opp = session.opponent_name?.trim() || "Adversário";
  const won = session.home_score > session.away_score;
  const lost = session.home_score < session.away_score;

  // ── Cabeçalho ───────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 38, W, 1.4, "F");

  const kicker = ["BOX SCORE", ctx.competition?.toUpperCase(), ctx.jornada ? `JORNADA ${ctx.jornada}` : null, ctx.serie ? `SÉRIE ${ctx.serie}` : null]
    .filter(Boolean).join("  ·  ");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text(kicker, M, 9);

  const dateStr = ctx.eventDate
    ? fmtLongDate(ctx.eventDate)
    : session.started_at ? new Date(session.started_at).toLocaleDateString("pt-PT") : "";
  const when = [dateStr, ctx.eventTime ? ctx.eventTime.slice(0, 5) : null].filter(Boolean).join(" · ");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 208, 222);
  doc.text(when, W - M, 9, { align: "right" });
  if (ctx.location) doc.text(ctx.location, W - M, 13.5, { align: "right" });

  // Placar: CD Póvoa à esquerda, adversário à direita
  const cx = W / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text(ctx.clubName || "CD Póvoa", cx - 34, 24, { align: "right" });
  doc.text(doc.splitTextToSize(opp, 90)[0], cx + 34, 24);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(170, 182, 200);
  if (ctx.isHome != null) {
    doc.text(ctx.isHome ? "CASA" : "FORA", cx - 34, 29, { align: "right" });
    doc.text(ctx.isHome ? "FORA" : "CASA", cx + 34, 29);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(...(won ? WHITE : [200, 208, 222] as RGB));
  doc.text(String(session.home_score), cx - 10, 27, { align: "right" });
  doc.setTextColor(...(lost ? WHITE : [200, 208, 222] as RGB));
  doc.text(String(session.away_score), cx + 10, 27);
  doc.setFontSize(18);
  doc.setTextColor(...ORANGE);
  doc.text("–", cx, 25, { align: "center" });

  // Selo do resultado
  const badge = won ? "VITÓRIA" : lost ? "DERROTA" : "EMPATE";
  doc.setFontSize(7.5);
  const bw = doc.getTextWidth(badge) + 8;
  doc.setFillColor(...(won ? ORANGE : NAVY_2));
  doc.roundedRect(cx - bw / 2, 30.5, bw, 5, 1.2, 1.2, "F");
  doc.setTextColor(...(won ? NAVY : WHITE));
  doc.text(badge, cx, 34, { align: "center" });

  let y = 45;

  // ── Totais (para destaques e linha final) ───────────────
  const sum = (f: (p: PdfPlayer) => number) => stats.reduce((s, p) => s + f(p), 0);
  const T = {
    pts: sum((p) => p.pts), fg2m: sum((p) => p.fg2_made), fg2a: sum((p) => p.fg2_att),
    fg3m: sum((p) => p.fg3_made), fg3a: sum((p) => p.fg3_att),
    ftm: sum((p) => p.ft_made), fta: sum((p) => p.ft_att),
    ro: sum((p) => p.reb_off), rd: sum((p) => p.reb_def),
    ast: sum((p) => p.ast), stl: sum((p) => p.stl), blk: sum((p) => p.blk), tov: sum((p) => p.tov),
    fc: sum((p) => p.fouls_committed), fd: sum((p) => p.fouls_drawn),
    eff: Math.round(sum((p) => Number(p.efficiency ?? 0))),
  };

  // ── Parciais (esquerda) ─────────────────────────────────
  const partials = toPeriodPartials(periodScores);
  const leftW = 128;
  if (partials.length > 0) {
    const lbl = (p: number) => (p <= 4 ? `${p}º P` : `PROL.${p > 5 ? ` ${p - 4}` : ""}`);
    autoTable(doc, {
      startY: y,
      head: [["PARCIAIS", ...partials.map((p) => lbl(p.period)), "FINAL"]],
      body: [
        [ctx.clubName || "CD Póvoa", ...partials.map((p) => p.home_score), session.home_score],
        [opp, ...partials.map((p) => p.away_score), session.away_score],
      ],
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, halign: "center", textColor: INK, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold", cellWidth: 46, overflow: "ellipsize" },
        [partials.length + 1]: { fontStyle: "bold", fillColor: ZEBRA },
      },
      didParseCell: (d: any) => {
        // vencedor de cada período a laranja
        if (d.section === "body" && d.column.index > 0 && d.column.index <= partials.length) {
          const p = partials[d.column.index - 1];
          const mine = d.row.index === 0 ? p.home_score : p.away_score;
          const other = d.row.index === 0 ? p.away_score : p.home_score;
          if (mine > other) { d.cell.styles.textColor = ORANGE; d.cell.styles.fontStyle = "bold"; }
        }
      },
      margin: { left: M },
      tableWidth: leftW,
    });
  }

  // ── Destaques (direita) ─────────────────────────────────
  const leader = (f: (p: PdfPlayer) => number) => {
    const best = [...stats].sort((a, b) => f(b) - f(a))[0];
    return best && f(best) > 0 ? { name: shortName(best.user?.name ?? "—"), v: f(best), n: best.jersey_number } : null;
  };
  const cards: { label: string; l: ReturnType<typeof leader> }[] = [
    { label: "PONTOS", l: leader((p) => p.pts) },
    { label: "RESSALTOS", l: leader((p) => p.reb_off + p.reb_def) },
    { label: "ASSISTÊNCIAS", l: leader((p) => p.ast) },
    { label: "EFICIÊNCIA", l: leader((p) => Number(p.efficiency ?? 0)) },
  ];
  const rx = M + leftW + 8;
  const rw = W - M - rx;
  const cw = (rw - 3 * 4) / 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("DESTAQUES CD PÓVOA", rx, y + 3);
  cards.forEach((c, i) => {
    const x = rx + i * (cw + 4);
    const top = y + 6;
    doc.setFillColor(...ZEBRA);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, top, cw, 17, 1.5, 1.5, "FD");
    doc.setFillColor(...ORANGE);
    doc.rect(x, top, 1.2, 17, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(c.label, x + 4, top + 5);
    doc.setFontSize(17);
    doc.setTextColor(...INK);
    doc.text(c.l ? String(Math.round(c.l.v)) : "—", x + 4, top + 11.5);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const who = c.l ? `${c.l.n != null ? `#${c.l.n} ` : ""}${c.l.name}` : "";
    doc.text(doc.splitTextToSize(who, cw - 6)[0] ?? "", x + 4, top + 15);
    doc.setFont("helvetica", "bold");
  });

  y = Math.max((doc as any).lastAutoTable?.finalY ?? y, y + 23) + 5;

  // ── Comparação de equipas ───────────────────────────────
  const oppReb = (session.away_reb_off ?? 0) + (session.away_reb_def ?? 0);
  autoTable(doc, {
    startY: y,
    head: [["EQUIPA", "PTS", "2P C/T", "2P%", "3P C/T", "3P%", "LL C/T", "LL%", "RES OF", "RES DEF", "RES", "AST", "ROU", "DES", "PER", "F", "FS", "EFF"]],
    body: [
      [ctx.clubName || "CD Póvoa", T.pts, `${T.fg2m}/${T.fg2a}`, pct(T.fg2m, T.fg2a), `${T.fg3m}/${T.fg3a}`, pct(T.fg3m, T.fg3a),
        `${T.ftm}/${T.fta}`, pct(T.ftm, T.fta), T.ro, T.rd, T.ro + T.rd, T.ast, T.stl, T.blk, T.tov, T.fc, T.fd, T.eff],
      [opp, session.away_score, "—", "—", "—", "—", "—", "—",
        session.away_reb_off ?? 0, session.away_reb_def ?? 0, oppReb, "—", "—", "—", "—", session.away_fouls ?? 0, "—", "—"],
    ],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8, halign: "center", textColor: INK, cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 6.8 },
    columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 46, overflow: "ellipsize" }, 1: { fontStyle: "bold" } },
    didParseCell: (d: any) => {
      if (d.section === "body" && d.row.index === 1 && d.cell.raw === "—") d.cell.styles.textColor = [180, 172, 162];
    },
    margin: { left: M, right: M, bottom: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Box score individual ────────────────────────────────
  const sorted = [...stats].sort((a, b) => b.pts - a.pts || Number(b.efficiency) - Number(a.efficiency));
  const maxOf = (f: (p: PdfPlayer) => number) => Math.max(0, ...stats.map(f));
  const best = {
    pts: maxOf((p) => p.pts), reb: maxOf((p) => p.reb_off + p.reb_def),
    ast: maxOf((p) => p.ast), stl: maxOf((p) => p.stl), blk: maxOf((p) => p.blk),
    eff: maxOf((p) => Number(p.efficiency ?? 0)),
  };
  // índices de coluna para destacar o melhor valor
  const HL: Record<number, (p: PdfPlayer) => number> = {
    3: (p) => p.pts, 12: (p) => p.reb_off + p.reb_def, 13: (p) => p.ast, 14: (p) => p.stl, 15: (p) => p.blk, 19: (p) => Number(p.efficiency ?? 0),
  };
  const HLmax: Record<number, number> = { 3: best.pts, 12: best.reb, 13: best.ast, 14: best.stl, 15: best.blk, 19: best.eff };

  autoTable(doc, {
    startY: y,
    head: [["#", "JOGADOR", "MIN", "PTS", "2P C/T", "2P%", "3P C/T", "3P%", "LL C/T", "LL%", "RO", "RD", "RES", "AST", "ROU", "DES", "PER", "F", "FS", "EFF", "+/-"]],
    body: sorted.map((p) => {
      const pm = Number(p.plus_minus ?? 0);
      return [
        p.jersey_number ?? "—",
        shortName(p.user?.name ?? "—"),
        mins(p.seconds_played ?? 0),
        p.pts,
        `${p.fg2_made}/${p.fg2_att}`, pct(p.fg2_made, p.fg2_att),
        `${p.fg3_made}/${p.fg3_att}`, pct(p.fg3_made, p.fg3_att),
        `${p.ft_made}/${p.ft_att}`, pct(p.ft_made, p.ft_att),
        p.reb_off, p.reb_def, p.reb_off + p.reb_def,
        p.ast, p.stl, p.blk, p.tov,
        p.fouls_committed, p.fouls_drawn,
        Math.round(Number(p.efficiency ?? 0)),
        pm > 0 ? `+${pm}` : String(pm),
      ];
    }),
    foot: [["", "TOTAL EQUIPA", "—", T.pts,
      `${T.fg2m}/${T.fg2a}`, pct(T.fg2m, T.fg2a), `${T.fg3m}/${T.fg3a}`, pct(T.fg3m, T.fg3a),
      `${T.ftm}/${T.fta}`, pct(T.ftm, T.fta), T.ro, T.rd, T.ro + T.rd, T.ast, T.stl, T.blk, T.tov, T.fc, T.fd, T.eff, ""]],
    showFoot: "lastPage",
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8, halign: "center", textColor: INK, cellPadding: { top: 1.45, bottom: 1.45, left: 0.8, right: 0.8 }, lineColor: LINE, lineWidth: { bottom: 0.15 } },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 6.8 },
    footStyles: { fillColor: TOTAL_BG, textColor: INK, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 9, textColor: MUTED, fontStyle: "bold" },
      1: { halign: "left", cellWidth: 40, fontStyle: "bold" },
      3: { fontStyle: "bold" },
      5: { textColor: MUTED }, 7: { textColor: MUTED }, 9: { textColor: MUTED },
      19: { fontStyle: "bold" },
    },
    didParseCell: (d: any) => {
      if (d.section === "body") {
        const p = sorted[d.row.index];
        const f = HL[d.column.index];
        if (f && HLmax[d.column.index] > 0 && f(p) === HLmax[d.column.index]) {
          d.cell.styles.textColor = ORANGE;
          d.cell.styles.fontStyle = "bold";
        }
        if (d.column.index === 20) {
          const pm = Number(p.plus_minus ?? 0);
          d.cell.styles.textColor = pm > 0 ? GREEN : pm < 0 ? RED : MUTED;
          d.cell.styles.fontStyle = "bold";
        }
      }
      if (d.section === "foot" && d.column.index === 1) d.cell.styles.halign = "left";
    },
    margin: { left: M, right: M, bottom: 14 },
  });

  // ── Rodapé ──────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, H - 10, W - M, H - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "C/T convertidos/tentados · RO/RD ressaltos ofensivos/defensivos · ROU roubos · DES desarmes · PER perdas de bola · F faltas · FS faltas sofridas · EFF eficiência · a laranja: melhor valor da equipa",
      M, H - 6
    );
    doc.setFont("helvetica", "bold");
    doc.text(`hoophub.pt  ·  ${new Date().toLocaleDateString("pt-PT")}${pages > 1 ? `  ·  ${i}/${pages}` : ""}`, W - M, H - 6, { align: "right" });
  }
}

export async function generateGamePDF(
  session: GameSession,
  stats: PdfPlayer[],
  periodScores: GamePeriodScore[],
  ctx: PdfGameContext = {}
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  renderBoxScore(doc, autoTable, session, stats, periodScores, ctx);

  const date = ctx.eventDate
    ?? (session.started_at ? new Date(session.started_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const slug = (session.opponent_name ?? "jogo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  doc.save(`BoxScore_CDPovoa_vs_${slug}_${date}.pdf`);
}
