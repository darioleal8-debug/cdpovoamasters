"use client";

import { useState, useEffect } from "react";
import { Loader2, Trophy, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Season { id: string; label: string }
interface GameRow {
  id: string; season_id: string; season_label: string; season_year: number;
  game_date: string | null; opponent_name: string | null;
  home_score: number | null; away_score: number | null;
  competition: string | null; pdf_filename: string | null;
  player_count: number; created_at: string;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function ResultBadge({ home, away }: { home: number | null; away: number | null }) {
  if (home === null || away === null) return <span className="text-muted-foreground text-xs">—</span>;
  const win = home > away;
  const draw = home === away;
  return (
    <span className={`font-bold tabular-nums ${win ? "text-green-600" : draw ? "text-yellow-600" : "text-red-500"}`}>
      {home} – {away}
    </span>
  );
}

export function GameHistoryTable() {
  const [seasons,  setSeasons]  = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [games,    setGames]    = useState<GameRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    fetch("/api/hist/seasons").then((r) => r.json()).then((d) => setSeasons(d.seasons ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = seasonId ? `/api/hist/games?season_id=${seasonId}` : "/api/hist/games";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? []))
      .finally(() => setLoading(false));
  }, [seasonId]);

  // Group by season
  const bySeason = new Map<string, GameRow[]>();
  for (const g of games) {
    const arr = bySeason.get(g.season_id) ?? [];
    arr.push(g);
    bySeason.set(g.season_id, arr);
  }
  const grouped = Array.from(bySeason.entries()).sort((a, b) => b[1][0].season_year - a[1][0].season_year);

  const wins   = games.filter((g) => (g.home_score ?? 0) > (g.away_score ?? 0)).length;
  const losses = games.filter((g) => (g.home_score ?? 0) < (g.away_score ?? 0)).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {games.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Jogos", value: games.length },
            { label: "Vitórias", value: wins, color: "text-green-600" },
            { label: "Derrotas", value: losses, color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-3 text-center">
              <p className={`text-2xl font-black ${s.color ?? ""}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Histórico de Jogos</CardTitle>
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
          ) : games.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              Nenhum jogo importado. Use o separador "Importar" para adicionar boxscores.
            </p>
          ) : (
            grouped.map(([seasonId, sGames]) => (
              <div key={seasonId}>
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-t">
                  <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {sGames[0].season_label}
                  </span>
                  <Badge variant="outline" className="text-[0.6rem] ml-auto">{sGames.length} jogos</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b bg-muted/20 text-xs">
                        <th className="text-left px-4 py-2 font-semibold">Data</th>
                        <th className="text-left px-3 py-2 font-semibold">Adversário</th>
                        <th className="px-3 py-2 font-semibold text-center">Resultado</th>
                        <th className="px-3 py-2 font-semibold text-center">Jog.</th>
                        <th className="text-left px-3 py-2 font-semibold">Competição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sGames.map((g) => {
                        const win = (g.home_score ?? 0) > (g.away_score ?? 0);
                        return (
                          <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDate(g.game_date)}</td>
                            <td className="px-3 py-2.5 font-medium">{g.opponent_name ?? "—"}</td>
                            <td className="px-3 py-2.5 text-center">
                              <ResultBadge home={g.home_score} away={g.away_score} />
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{g.player_count}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{g.competition ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
