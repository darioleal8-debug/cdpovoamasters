"use client";

import { cn } from "@/lib/utils";
import type { StandingRow } from "@/types/competitions";

interface Props {
  standings: StandingRow[];
  ourTeamName?: string;
  limit?: number; // show only top N rows
}

export function StandingsTable({ standings, ourTeamName, limit }: Props) {
  const rows = limit ? standings.slice(0, limit) : standings;

  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        Sem resultados registados ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[360px] text-sm">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground text-xs uppercase tracking-wide">
            <th className="text-left pl-4 py-2 w-8">#</th>
            <th className="text-left px-2 py-2">Equipa</th>
            <th className="text-center px-2 py-2 w-8">J</th>
            <th className="text-center px-2 py-2 w-8 hidden sm:table-cell">V</th>
            <th className="text-center px-2 py-2 w-8 hidden sm:table-cell">D</th>
            <th className="text-center px-2 py-2 w-14 hidden md:table-cell">PF</th>
            <th className="text-center px-2 py-2 w-14 hidden md:table-cell">PC</th>
            <th className="text-center px-2 py-2 w-14 hidden sm:table-cell">Dif</th>
            <th className="text-center pr-4 py-2 w-10 font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isOurs = ourTeamName && row.team_name === ourTeamName;
            return (
              <tr
                key={row.team_name}
                className={cn(
                  "border-b border-border/30 transition-colors",
                  isOurs
                    ? "bg-orange-500/10 font-semibold"
                    : "hover:bg-muted/40"
                )}
              >
                <td className="pl-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-3 max-w-[140px] truncate">
                  {isOurs ? (
                    <span className="text-orange-600 dark:text-orange-400">{row.team_name}</span>
                  ) : row.team_name}
                </td>
                <td className="text-center px-2 py-3 tabular-nums">{row.gp}</td>
                <td className="text-center px-2 py-3 tabular-nums hidden sm:table-cell text-green-600 dark:text-green-400">{row.wins}</td>
                <td className="text-center px-2 py-3 tabular-nums hidden sm:table-cell text-red-500">{row.losses}</td>
                <td className="text-center px-2 py-3 tabular-nums hidden md:table-cell">{row.pf}</td>
                <td className="text-center px-2 py-3 tabular-nums hidden md:table-cell">{row.pc}</td>
                <td className={cn(
                  "text-center px-2 py-3 tabular-nums hidden sm:table-cell",
                  row.diff > 0 ? "text-green-600 dark:text-green-400" : row.diff < 0 ? "text-red-500" : ""
                )}>
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </td>
                <td className="text-center pr-4 py-3 tabular-nums font-bold">{row.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
