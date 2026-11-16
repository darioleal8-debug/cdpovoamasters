import type { CSSProperties, ReactNode } from "react";
import { TeamMono } from "./team-mono";

export interface StandingRow {
  team_name: string;
  gp: number;
  wins: number;
  draws?: number;
  losses: number;
  pf: number;
  pc: number;
  diff: number;
  pts: number;
  /** Últimos jogos, do mais recente para o mais antigo. */
  form?: ("V" | "E" | "D")[];
  home_w?: number; home_d?: number; home_l?: number;
  away_w?: number; away_d?: number; away_l?: number;
}

interface Props {
  standings: StandingRow[];
  ourTeamName?: string;
  limit?: number;
  mini?: boolean; // versão compacta para o dashboard da homepage
  teamLogos?: Record<string, string | null>;
}

const FORM_STYLE: Record<"V" | "E" | "D", CSSProperties> = {
  V: { background: "#2F7A3E", color: "#FFFFFF" },
  E: { background: "#E9E2D8", color: "#6F675F" },
  D: { background: "#B3261E", color: "#FFFFFF" },
};

/** "2-1" (V-D) — acrescenta os empates ("2-1-1" = V-E-D) só quando existem. */
function record(w = 0, d = 0, l = 0): string {
  return d > 0 ? `${w}-${d}-${l}` : `${w}-${l}`;
}

export function StandingsTable({ standings, ourTeamName, limit, mini, teamLogos }: Props) {
  const rows = limit ? standings.slice(0, limit) : standings;
  const hasForm = rows.some((r) => r.form && r.form.length > 0);
  const hasSplit = rows.some((r) => r.home_w !== undefined);
  const hasDraws = rows.some((r) => (r.draws ?? 0) > 0);

  if (rows.length === 0) {
    return (
      <p
        style={{
          textAlign: "center",
          padding: "32px 16px",
          fontFamily: "var(--font-barlow, sans-serif)",
          fontSize: "14px",
          color: "#6F675F",
        }}
      >
        A classificação será actualizada com os primeiros resultados aprovados.
      </p>
    );
  }

  const padY = mini ? "10px" : "12px";
  const padX = mini ? "8px" : "10px";
  const BG = "#FFFDFA";

  // Colunas fixas à esquerda (# e Equipa) para a tabela larga continuar legível no telemóvel
  const stickyBase: CSSProperties = { position: "sticky", zIndex: 1 };
  const POS_W = 36;

  const TH = ({
    children,
    right,
    center,
    sticky,
    title,
  }: {
    children: ReactNode;
    right?: boolean;
    center?: boolean;
    sticky?: "pos" | "team";
    title?: string;
  }) => (
    <th
      title={title}
      style={{
        padding: mini ? "6px 8px" : `8px ${padX}`,
        textAlign: center ? "center" : right ? "right" : "left",
        fontFamily: "var(--font-ibm-mono, monospace)",
        fontSize: "10px",
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#6F675F",
        whiteSpace: "nowrap",
        borderBottom: "2px solid #E9E2D8",
        background: BG,
        ...(sticky === "pos" ? { ...stickyBase, left: 0, minWidth: POS_W } : {}),
        ...(sticky === "team"
          ? { ...stickyBase, left: POS_W, boxShadow: "6px 0 6px -6px rgba(26,22,18,.18)" }
          : {}),
      }}
    >
      {children}
    </th>
  );

  const num: CSSProperties = {
    padding: `${padY} ${padX}`,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table
        style={{
          width: "100%",
          minWidth: mini ? 320 : undefined,
          borderCollapse: "separate",
          borderSpacing: 0,
          fontFamily: "var(--font-barlow, sans-serif)",
          fontSize: mini ? "13px" : "14px",
        }}
      >
        <thead>
          <tr>
            <TH sticky={mini ? undefined : "pos"}>#</TH>
            <TH sticky={mini ? undefined : "team"}>Equipa</TH>
            <TH right title="Jogos">J</TH>
            {!mini && <TH right title="Vitórias">V</TH>}
            {!mini && hasDraws && <TH right title="Empates">E</TH>}
            {!mini && <TH right title="Derrotas">D</TH>}
            {!mini && <TH right title="Pontos marcados">PM</TH>}
            {!mini && <TH right title="Pontos sofridos">PS</TH>}
            {!mini && <TH right title="Diferença de pontos">Dif</TH>}
            <TH right title="Pontos na classificação">PTS</TH>
            {!mini && hasForm && <TH center title="Últimos 5 jogos (o mais recente à direita)">Últ. 5</TH>}
            {!mini && hasSplit && <TH center title="Vitórias-derrotas em casa">Casa</TH>}
            {!mini && hasSplit && <TH center title="Vitórias-derrotas fora">Fora</TH>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isFirst = i === 0;
            const isOurs = ourTeamName && row.team_name === ourTeamName;
            const rowBg = isFirst ? "#FFF4EA" : isOurs ? "#FEF3EA" : BG;
            const cellBorder = "1px solid #F0EAE1";
            const sticky = (kind: "pos" | "team"): CSSProperties =>
              mini
                ? {}
                : kind === "pos"
                  ? { ...stickyBase, left: 0, background: rowBg, minWidth: POS_W }
                  : { ...stickyBase, left: POS_W, background: rowBg, boxShadow: "6px 0 6px -6px rgba(26,22,18,.18)" };
            const form = [...(row.form ?? [])].slice(0, 5).reverse(); // antigo → recente

            return (
              <tr key={row.team_name} style={{ background: rowBg }}>
                {/* Posição */}
                <td
                  style={{
                    padding: `${padY} ${padX}`,
                    borderBottom: cellBorder,
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 700,
                    fontSize: mini ? "15px" : "18px",
                    color: isFirst ? "#F97316" : "#8C837A",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    ...sticky("pos"),
                  }}
                >
                  {i + 1}
                </td>

                {/* Equipa */}
                <td
                  style={{
                    padding: `${padY} ${padX}`,
                    borderBottom: cellBorder,
                    maxWidth: mini ? 140 : undefined,
                    ...sticky("team"),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TeamMono name={row.team_name} size={mini ? 28 : 32} logoUrl={teamLogos?.[row.team_name]} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: mini ? undefined : 150,
                        fontWeight: isOurs ? 600 : 400,
                        color: isOurs ? "#C2530A" : "#1A1612",
                      }}
                    >
                      {row.team_name}
                    </span>
                  </div>
                </td>

                {/* J */}
                <td style={{ ...num, borderBottom: cellBorder }}>{row.gp}</td>

                {!mini && <td style={{ ...num, borderBottom: cellBorder, color: "#2F7A3E" }}>{row.wins}</td>}
                {!mini && hasDraws && (
                  <td style={{ ...num, borderBottom: cellBorder, color: "#6F675F" }}>{row.draws ?? 0}</td>
                )}
                {!mini && <td style={{ ...num, borderBottom: cellBorder, color: "#B3261E" }}>{row.losses}</td>}
                {!mini && <td style={{ ...num, borderBottom: cellBorder }}>{row.pf}</td>}
                {!mini && <td style={{ ...num, borderBottom: cellBorder }}>{row.pc}</td>}

                {/* DIF */}
                {!mini && (
                  <td
                    style={{
                      ...num,
                      borderBottom: cellBorder,
                      color: row.diff > 0 ? "#2F7A3E" : row.diff < 0 ? "#B3261E" : "#6F675F",
                    }}
                  >
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                )}

                {/* PTS */}
                <td
                  style={{
                    ...num,
                    borderBottom: cellBorder,
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 800,
                    fontSize: mini ? "18px" : "22px",
                    color: "#1A1612",
                  }}
                >
                  {row.pts}
                </td>

                {/* Últimos 5 (antigo → recente) */}
                {!mini && hasForm && (
                  <td style={{ padding: `${padY} ${padX}`, borderBottom: cellBorder }}>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                      {form.length === 0 ? (
                        <span style={{ color: "#8C837A", fontSize: "12px" }}>–</span>
                      ) : (
                        form.map((f, fi) => (
                          <span
                            key={fi}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 22,
                              height: 22,
                              borderRadius: "4px",
                              fontFamily: "var(--font-ibm-mono, monospace)",
                              fontSize: "11px",
                              fontWeight: 600,
                              ...FORM_STYLE[f],
                              outline: fi === form.length - 1 ? "2px solid #F97316" : undefined,
                              outlineOffset: 1,
                            }}
                          >
                            {f}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                )}

                {/* Casa / Fora (V-D) */}
                {!mini && hasSplit && (
                  <td style={{ ...num, textAlign: "center", borderBottom: cellBorder }}>
                    {record(row.home_w, row.home_d, row.home_l)}
                  </td>
                )}
                {!mini && hasSplit && (
                  <td style={{ ...num, textAlign: "center", borderBottom: cellBorder }}>
                    {record(row.away_w, row.away_d, row.away_l)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
