"use client";

import { useState } from "react";
import { StandingsTable, type StandingRow } from "./standings-table";

export interface SeriesTab {
  series: string | null;
  label: string;
  rows: StandingRow[];
}

interface Props {
  groups: SeriesTab[];
  /** Série aberta por omissão (ex.: a da equipa da casa). Usa a primeira se omitida. */
  defaultSeries?: string | null;
  teamLogos?: Record<string, string | null>;
  limit?: number;
  mini?: boolean;
}

export function SeriesStandingsTabs({ groups, defaultSeries, teamLogos, limit, mini }: Props) {
  const initial = groups.findIndex((g) => g.series === defaultSeries);
  const [active, setActive] = useState(initial >= 0 ? initial : 0);

  if (groups.length === 0) return <StandingsTable standings={[]} mini={mini} />;
  if (groups.length === 1) {
    return <StandingsTable standings={groups[0].rows} teamLogos={teamLogos} limit={limit} mini={mini} />;
  }

  const current = groups[Math.min(active, groups.length - 1)];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Séries"
        style={{ display: "flex", borderBottom: "1px solid #E9E2D8", background: "#F6F2EC" }}
      >
        {groups.map((g, i) => {
          const selected = i === active;
          return (
            <button
              key={g.series ?? "sem-serie"}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(i)}
              style={{
                flex: 1,
                padding: "10px 8px",
                border: "none",
                borderBottom: selected ? "2px solid #F97316" : "2px solid transparent",
                background: selected ? "#FFFDFA" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-ibm-mono, monospace)",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: selected ? "#1A1612" : "#6F675F",
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={current.label}>
        <StandingsTable standings={current.rows} teamLogos={teamLogos} limit={limit} mini={mini} />
      </div>
    </div>
  );
}
