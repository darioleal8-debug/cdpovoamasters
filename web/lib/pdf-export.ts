import type { GameSession, PlayerGameStatsWithUser, GamePeriodScore } from "@/types/database";

function pct(made: number, att: number): string {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : "—";
}

function secsToMin(secs: number): string {
  if (!secs) return "0:00";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export async function generateGamePDF(
  session: GameSession,
  stats: (PlayerGameStatsWithUser & { jersey_number?: number | null; seconds_played?: number })[],
  periodScores: GamePeriodScore[]
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const date = session.started_at
    ? new Date(session.started_at).toLocaleDateString("pt-PT")
    : new Date().toLocaleDateString("pt-PT");

  // ── Header azul ───────────────────────────────────────────
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255, 255, 255);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CD PÓVOA MASTERS — BOX SCORE", 14, 10);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(date, pageW - 14, 10, { align: "right" });

  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text(`${session.home_score}`, 14, 26);
  doc.setFontSize(14);
  doc.text("vs", pageW / 2, 24, { align: "center" });
  doc.setFontSize(26);
  doc.text(`${session.away_score}`, pageW - 14, 26, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("CD Póvoa Masters", 14, 31);
  doc.text(session.opponent_name, pageW - 14, 31, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 40;

  // ── Pontuação por período ─────────────────────────────────
  if (periodScores.length > 0) {
    const pLabels = periodScores.map((p) => `P${p.period}`);
    autoTable(doc, {
      startY: y,
      head: [["", ...pLabels, "TOTAL"]],
      body: [
        ["CD Póvoa Masters", ...periodScores.map((p) => p.home_score), session.home_score],
        [session.opponent_name, ...periodScores.map((p) => p.away_score), session.away_score],
      ],
      styles: { fontSize: 9, halign: "center" as const },
      headStyles: { fillColor: [0, 51, 102] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const },
      columnStyles: { 0: { halign: "left" as const, fontStyle: "bold" as const, cellWidth: 48 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Totais da equipa ──────────────────────────────────────
  const tot2M  = stats.reduce((s, p) => s + p.fg2_made, 0);
  const tot2A  = stats.reduce((s, p) => s + p.fg2_att, 0);
  const tot3M  = stats.reduce((s, p) => s + p.fg3_made, 0);
  const tot3A  = stats.reduce((s, p) => s + p.fg3_att, 0);
  const totFtM = stats.reduce((s, p) => s + p.ft_made, 0);
  const totFtA = stats.reduce((s, p) => s + p.ft_att, 0);
  const totPts = stats.reduce((s, p) => s + p.pts, 0);
  const totReb = stats.reduce((s, p) => s + p.reb_off + p.reb_def, 0);
  const totAst = stats.reduce((s, p) => s + p.ast, 0);
  const totStl = stats.reduce((s, p) => s + p.stl, 0);
  const totBlk = stats.reduce((s, p) => s + p.blk, 0);
  const totTov = stats.reduce((s, p) => s + p.tov, 0);
  const totFC  = stats.reduce((s, p) => s + p.fouls_committed, 0);
  const totFD  = stats.reduce((s, p) => s + p.fouls_drawn, 0);
  const totEff = stats.reduce((s, p) => s + Number(p.efficiency), 0);

  autoTable(doc, {
    startY: y,
    head: [["EQUIPA", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FC", "FD",
      "2P/A", "2P%", "3P/A", "3P%", "LL/A", "LL%", "EFF"]],
    body: [
      ["CD Póvoa Masters",
        totPts, totReb, totAst, totStl, totBlk, totTov, totFC, totFD,
        `${tot2M}/${tot2A}`, pct(tot2M, tot2A),
        `${tot3M}/${tot3A}`, pct(tot3M, tot3A),
        `${totFtM}/${totFtA}`, pct(totFtM, totFtA),
        totEff.toFixed(0)],
    ],
    styles: { fontSize: 8, halign: "center" as const },
    headStyles: { fillColor: [0, 51, 102] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const, fontSize: 7 },
    columnStyles: { 0: { halign: "left" as const, fontStyle: "bold" as const, cellWidth: 42 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Box score por jogador ─────────────────────────────────
  const sorted = [...stats].sort((a, b) => b.pts - a.pts);

  autoTable(doc, {
    startY: y,
    head: [["#", "JOGADOR", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV",
      "FC", "FD", "2P%", "3P%", "LL%", "EFF", "+/-"]],
    body: sorted.map((p) => [
      p.jersey_number ?? "—",
      p.user.name.split(" ").slice(0, 2).join(" "),
      secsToMin(p.seconds_played ?? 0),
      p.pts,
      p.reb_off + p.reb_def,
      p.ast, p.stl, p.blk, p.tov,
      p.fouls_committed, p.fouls_drawn,
      pct(p.fg2_made, p.fg2_att),
      pct(p.fg3_made, p.fg3_att),
      pct(p.ft_made, p.ft_att),
      Number(p.efficiency).toFixed(0),
      p.plus_minus >= 0 ? `+${p.plus_minus}` : String(p.plus_minus),
    ]),
    foot: [["", "TOTAL", "—",
      totPts, totReb, totAst, totStl, totBlk, totTov, totFC, totFD,
      pct(tot2M, tot2A), pct(tot3M, tot3A), pct(totFtM, totFtA),
      totEff.toFixed(0), "—"]],
    styles: { fontSize: 8, halign: "center" as const },
    headStyles: { fillColor: [0, 51, 102] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const, fontSize: 7 },
    footStyles: { fillColor: [220, 230, 240] as [number, number, number], fontStyle: "bold" as const, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { halign: "left" as const, cellWidth: 38 },
    },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 3 && Number(data.cell.raw) >= 20) {
        data.cell.styles.textColor = [0, 130, 0];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  // ── Rodapé ────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `Gerado por CD Póvoa Masters App · ${new Date().toLocaleString("pt-PT")}`,
    14, pageH - 5
  );

  const fname = `CDP_${session.opponent_name.replace(/\s+/g, "_")}_${date.replace(/\//g, "-")}.pdf`;
  doc.save(fname);
}
