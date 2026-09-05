"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Season { id: string; label: string }
interface PlayerRow {
  player_id: string; player_name: string;
  season_id: string; season_label: string; season_year: number;
  games: number;
  total_pts: number; total_reb: number; total_ast: number;
  avg_pts: number; avg_reb: number; avg_ast: number; avg_eff: number;
}

function pct(v: number) { return v.toFixed(1); }

export function PlayerHistoryTable() {
  const [seasons,    setSeasons]    = useState<Season[]>([]);
  const [seasonId,   setSeasonId]   = useState("");
  const [rows,       setRows]       = useState<PlayerRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/hist/seasons").then((r) => r.json()).then((d) => setSeasons(d.seasons ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = seasonId ? `/api/hist/players?season_id=${seasonId}` : "/api/hist/players";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  }, [seasonId]);

  // Group by player
  const byPlayer = new Map<string, PlayerRow[]>();
  for (const r of rows) {
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  const players = Array.from(byPlayer.entries()).sort((a, b) =>
    a[1][0].player_name.localeCompare(b[1][0].player_name, "pt")
  );

  function toggle(playerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(playerId) ? next.delete(playerId) : next.add(playerId);
      return next;
    });
  }

  // Career totals per player
  function career(pRows: PlayerRow[]) {
    const g  = pRows.reduce((s, r) => s + r.games, 0);
    const tp = pRows.reduce((s, r) => s + r.total_pts, 0);
    const tr = pRows.reduce((s, r) => s + r.total_reb, 0);
    const ta = pRows.reduce((s, r) => s + r.total_ast, 0);
    return { g, avgPts: g ? +(tp / g).toFixed(1) : 0, avgReb: g ? +(tr / g).toFixed(1) : 0, avgAst: g ? +(ta / g).toFixed(1) : 0 };
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Histórico de Jogadores</CardTitle>
        <select
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todas as temporadas</option>
          {seasons.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : players.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            Nenhum dado encontrado. Importe estatísticas para ver o histórico.
          </p>
        ) : (
          <div className="divide-y">
            {players.map(([playerId, pRows]) => {
              const isOpen = expanded.has(playerId);
              const cv     = career(pRows);
              const seasons = pRows.map((r) => r.season_label);
              return (
                <div key={playerId}>
                  {/* Player header row */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                    onClick={() => toggle(playerId)}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="font-semibold flex-1">{pRows[0].player_name}</span>
                    <div className="hidden sm:flex gap-1 flex-wrap">
                      {seasons.map((s) => <Badge key={s} variant="outline" className="text-[0.6rem] px-1.5 py-0">{s}</Badge>)}
                    </div>
                    <div className="flex gap-4 text-sm tabular-nums text-right ml-4">
                      <span className="text-muted-foreground text-xs">{cv.g} jg.</span>
                      <span>{pct(cv.avgPts)} <span className="text-muted-foreground text-xs">pts</span></span>
                      <span>{pct(cv.avgReb)} <span className="text-muted-foreground text-xs">reb</span></span>
                      <span className="hidden sm:inline">{pct(cv.avgAst)} <span className="text-muted-foreground text-xs">ast</span></span>
                    </div>
                  </button>

                  {/* Per-season breakdown */}
                  {isOpen && (
                    <div className="bg-muted/20 border-t overflow-x-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left px-6 py-2 font-semibold text-muted-foreground">Temporada</th>
                            <th className="px-3 py-2 text-center font-semibold">Jg.</th>
                            <th className="px-3 py-2 text-center font-semibold">PTS</th>
                            <th className="px-3 py-2 text-center font-semibold">REB</th>
                            <th className="px-3 py-2 text-center font-semibold">AST</th>
                            <th className="px-3 py-2 text-center font-semibold">EFF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {pRows.map((r) => (
                            <tr key={r.season_id} className="hover:bg-muted/40">
                              <td className="px-6 py-2 font-medium">{r.season_label}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{r.games}</td>
                              <td className="px-3 py-2 text-center tabular-nums font-semibold">{pct(r.avg_pts)}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{pct(r.avg_reb)}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{pct(r.avg_ast)}</td>
                              <td className="px-3 py-2 text-center tabular-nums text-primary">{pct(r.avg_eff)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
