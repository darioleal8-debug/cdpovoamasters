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
  form?: ("V" | "E" | "D")[];
}

interface Props {
  standings: StandingRow[];
  ourTeamName?: string;
  limit?: number;
  mini?: boolean; // versão compacta para o dashboard da homepage
  teamLogos?: Record<string, string | null>;
}

export function StandingsTable({ standings, ourTeamName, limit, mini, teamLogos }: Props) {
  const rows = limit ? standings.slice(0, limit) : standings;
  const hasForm = rows.some((r) => r.form && r.form.length > 0);

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

  const TH = ({
    children,
    right,
    hide,
  }: {
    children: React.ReactNode;
    right?: boolean;
    hide?: "sm" | "md";
  }) => (
    <th
      style={{
        padding: mini ? "6px 8px" : "8px 10px",
        textAlign: right ? "right" : "left",
        fontFamily: "var(--font-ibm-mono, monospace)",
        fontSize: "10px",
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#6F675F",
        whiteSpace: "nowrap",
        borderBottom: "2px solid #E9E2D8",
        display: hide === "sm" ? undefined : hide === "md" ? undefined : undefined,
      }}
      className={hide === "sm" ? "hidden sm:table-cell" : hide === "md" ? "hidden md:table-cell" : undefined}
    >
      {children}
    </th>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          minWidth: mini ? 320 : 480,
          borderCollapse: "collapse",
          fontFamily: "var(--font-barlow, sans-serif)",
          fontSize: mini ? "13px" : "14px",
        }}
      >
        <thead>
          <tr>
            <TH>#</TH>
            <TH>Equipa</TH>
            <TH right>J</TH>
            {!mini && <TH right hide="sm">V</TH>}
            {!mini && <TH right hide="sm">E</TH>}
            {!mini && <TH right hide="sm">D</TH>}
            {!mini && <TH right hide="md">PM</TH>}
            {!mini && <TH right hide="md">PS</TH>}
            {!mini && <TH right hide="sm">Dif</TH>}
            <TH right>PTS</TH>
            {!mini && hasForm && <TH hide="sm">Forma</TH>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isFirst = i === 0;
            const isOurs = ourTeamName && row.team_name === ourTeamName;
            return (
              <tr
                key={row.team_name}
                style={{
                  background: isFirst ? "#FFF4EA" : isOurs ? "rgba(249,115,22,.06)" : undefined,
                  borderBottom: "1px solid #F0EAE1",
                }}
              >
                {/* Posição */}
                <td
                  style={{
                    padding: mini ? "10px 8px" : "12px 10px",
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 700,
                    fontSize: mini ? "15px" : "18px",
                    color: isFirst ? "#F97316" : "#8C837A",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {i + 1}
                </td>

                {/* Equipa */}
                <td style={{ padding: mini ? "10px 8px" : "12px 10px", maxWidth: mini ? 140 : 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TeamMono name={row.team_name} size={mini ? 28 : 32} logoUrl={teamLogos?.[row.team_name]} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isOurs ? 600 : 400,
                        color: isOurs ? "#C2530A" : "#1A1612",
                      }}
                    >
                      {row.team_name}
                    </span>
                  </div>
                </td>

                {/* J */}
                <td style={{ padding: mini ? "10px 8px" : "12px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {row.gp}
                </td>

                {/* V */}
                {!mini && (
                  <td
                    className="hidden sm:table-cell"
                    style={{ padding: "12px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#2F7A3E" }}
                  >
                    {row.wins}
                  </td>
                )}

                {/* E */}
                {!mini && (
                  <td
                    className="hidden sm:table-cell"
                    style={{ padding: "12px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#6F675F" }}
                  >
                    {row.draws ?? 0}
                  </td>
                )}

                {/* D */}
                {!mini && (
                  <td
                    className="hidden sm:table-cell"
                    style={{ padding: "12px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#B3261E" }}
                  >
                    {row.losses}
                  </td>
                )}

                {/* PM */}
                {!mini && (
                  <td
                    className="hidden md:table-cell"
                    style={{ padding: "12px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.pf}
                  </td>
                )}

                {/* PS */}
                {!mini && (
                  <td
                    className="hidden md:table-cell"
                    style={{ padding: "12px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.pc}
                  </td>
                )}

                {/* DIF */}
                {!mini && (
                  <td
                    className="hidden sm:table-cell"
                    style={{
                      padding: "12px 10px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: row.diff > 0 ? "#2F7A3E" : row.diff < 0 ? "#B3261E" : "#6F675F",
                    }}
                  >
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                )}

                {/* PTS */}
                <td
                  style={{
                    padding: mini ? "10px 8px" : "12px 10px",
                    textAlign: "right",
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 800,
                    fontSize: mini ? "18px" : "22px",
                    color: "#1A1612",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.pts}
                </td>

                {/* Forma */}
                {!mini && hasForm && (
                  <td className="hidden sm:table-cell" style={{ padding: "12px 10px" }}>
                    <div style={{ display: "flex", gap: 3 }}>
                      {(row.form ?? []).length === 0
                        ? <span style={{ color: "#8C837A", fontSize: "12px" }}>–</span>
                        : (row.form ?? []).map((f, fi) => (
                            <span
                              key={fi}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 20,
                                height: 20,
                                borderRadius: "3px",
                                fontFamily: "var(--font-ibm-mono, monospace)",
                                fontSize: "10px",
                                fontWeight: 500,
                                letterSpacing: 0,
                                background: f === "V" ? "#1A1612" : f === "E" ? "#F5EFE6" : "#E9E2D8",
                                color: f === "V" ? "#F97316" : f === "E" ? "#8C837A" : "#6F675F",
                                border: f === "E" ? "1px solid #E9E2D8" : undefined,
                              }}
                            >
                              {f}
                            </span>
                          ))}
                    </div>
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
