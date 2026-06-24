"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameSession } from "@/hooks/use-game-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Radio, Trophy } from "lucide-react";
import type { PlayerGameStatsWithUser } from "@/types/database";

function pct(made: number, att: number) {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : "—";
}

function StatCell({ value }: { value: string | number }) {
  return (
    <td className="px-2 py-2 text-center text-sm tabular-nums">{value}</td>
  );
}

function getMvp(stats: PlayerGameStatsWithUser[]): PlayerGameStatsWithUser | null {
  if (!stats.length) return null;
  return [...stats].sort((a, b) => b.efficiency - a.efficiency)[0];
}

export default function GameStatsPage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [seasonId, setSeasonId] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("seasons").select("id").eq("status", "ativa").single()
      .then(({ data }) => { if (data) setSeasonId(data.id); });
  }, []);

  const { session, plays, playerStats, periodScores, loading } =
    useGameSession(params.eventId, seasonId ?? "");

  if (loading || !seasonId) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-muted-foreground">Nenhuma sessão de jogo encontrada.</p>
        <Button variant="outline" onClick={() => router.back()}>Voltar</Button>
      </div>
    );
  }

  const mvp = getMvp(playerStats);
  const totPts = playerStats.reduce((s, p) => s + p.pts, 0);
  const totReb = playerStats.reduce((s, p) => s + p.reb_off + p.reb_def, 0);
  const totAst = playerStats.reduce((s, p) => s + p.ast, 0);
  const totStl = playerStats.reduce((s, p) => s + p.stl, 0);
  const totBlk = playerStats.reduce((s, p) => s + p.blk, 0);
  const totTov = playerStats.reduce((s, p) => s + p.tov, 0);
  const totFg2M = playerStats.reduce((s, p) => s + p.fg2_made, 0);
  const totFg2A = playerStats.reduce((s, p) => s + p.fg2_att, 0);
  const totFg3M = playerStats.reduce((s, p) => s + p.fg3_made, 0);
  const totFg3A = playerStats.reduce((s, p) => s + p.fg3_att, 0);
  const totFtM  = playerStats.reduce((s, p) => s + p.ft_made, 0);
  const totFtA  = playerStats.reduce((s, p) => s + p.ft_att, 0);

  const sortedStats = [...playerStats].sort((a, b) => b.pts - a.pts);

  return (
    <div className="space-y-4 pb-8">
      {/* ── Cabeçalho ────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Box Score</h1>
          <p className="text-sm text-muted-foreground">
            CD Póvoa vs {session.opponent_name}
          </p>
        </div>
        {session.status === "live" && (
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => router.push(`/jogos/${params.eventId}/live`)}>
            <Radio className="mr-1.5 h-3.5 w-3.5" />
            Live
          </Button>
        )}
      </div>

      {/* ── Resultado ────────────────────────────────────── */}
      <Card className="bg-cdpovoa-blue text-white border-0">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-xs text-white/50 uppercase tracking-widest">CD Póvoa</p>
              <p className="text-5xl font-black tabular-nums">{session.home_score}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Badge className={session.status === "live" ? "bg-green-500" : "bg-white/20"}>
                {session.status === "live" ? "● LIVE" : "Final"}
              </Badge>
              <span className="text-xs text-white/40">{session.current_period}º período</span>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-white/50 uppercase tracking-widest truncate max-w-[90px] mx-auto">
                {session.opponent_name}
              </p>
              <p className="text-5xl font-black tabular-nums">{session.away_score}</p>
            </div>
          </div>

          {/* Pontuação por período */}
          {periodScores.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex justify-around text-xs text-white/50">
                <span className="w-20"></span>
                {periodScores.map((p) => (
                  <span key={p.period} className="text-center">P{p.period}</span>
                ))}
                <span className="font-bold text-white">Total</span>
              </div>
              <div className="flex justify-around text-xs mt-1">
                <span className="w-20 text-white/60">CD Póvoa</span>
                {periodScores.map((p) => (
                  <span key={p.period} className="text-center text-white">{p.home_score}</span>
                ))}
                <span className="font-bold text-white">{session.home_score}</span>
              </div>
              <div className="flex justify-around text-xs mt-1">
                <span className="w-20 text-white/60 truncate">{session.opponent_name}</span>
                {periodScores.map((p) => (
                  <span key={p.period} className="text-center text-white/70">{p.away_score}</span>
                ))}
                <span className="font-bold text-white/70">{session.away_score}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MVP ──────────────────────────────────────────── */}
      {mvp && session.status === "finished" && (
        <Card className="border-yellow-400 bg-yellow-50">
          <CardContent className="py-3 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500 shrink-0" />
            <div>
              <p className="text-xs text-yellow-700 font-semibold uppercase tracking-widest">MVP do Jogo</p>
              <p className="font-bold">{mvp.user.name}</p>
              <p className="text-xs text-muted-foreground">
                {mvp.pts} pts · {mvp.reb_off + mvp.reb_def} reb · {mvp.ast} ast · EFF {mvp.efficiency}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Totais da Equipa ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Totais da Equipa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Pontos", value: totPts },
              { label: "Reb.", value: totReb },
              { label: "Ast.", value: totAst },
              { label: "Roubos", value: totStl },
              { label: "Desarmes", value: totBlk },
              { label: "Turnovers", value: totTov },
              { label: "2P %", value: pct(totFg2M, totFg2A) },
              { label: "3P %", value: pct(totFg3M, totFg3A) },
              { label: "LL %", value: pct(totFtM, totFtA) },
              { label: "2P", value: `${totFg2M}/${totFg2A}` },
              { label: "3P", value: `${totFg3M}/${totFg3A}` },
              { label: "LL", value: `${totFtM}/${totFtA}` },
            ].map((stat) => (
              <div key={stat.label} className="bg-muted/50 rounded-lg p-2">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Box Score por Jogador ────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Box Score</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-semibold min-w-[110px]">Jogador</th>
                  <th className="px-2 py-2 text-center font-semibold">PTS</th>
                  <th className="px-2 py-2 text-center font-semibold">REB</th>
                  <th className="px-2 py-2 text-center font-semibold">AST</th>
                  <th className="px-2 py-2 text-center font-semibold">STL</th>
                  <th className="px-2 py-2 text-center font-semibold">BLK</th>
                  <th className="px-2 py-2 text-center font-semibold">TOV</th>
                  <th className="px-2 py-2 text-center font-semibold">2P</th>
                  <th className="px-2 py-2 text-center font-semibold">3P</th>
                  <th className="px-2 py-2 text-center font-semibold">LL</th>
                  <th className="px-2 py-2 text-center font-semibold text-cdpovoa-blue">EFF</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedStats.map((p) => (
                  <tr key={p.player_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium max-w-[110px] truncate">
                      {p.user.name.split(" ").slice(0, 2).join(" ")}
                    </td>
                    <StatCell value={p.pts} />
                    <StatCell value={p.reb_off + p.reb_def} />
                    <StatCell value={p.ast} />
                    <StatCell value={p.stl} />
                    <StatCell value={p.blk} />
                    <StatCell value={p.tov} />
                    <StatCell value={pct(p.fg2_made, p.fg2_att)} />
                    <StatCell value={pct(p.fg3_made, p.fg3_att)} />
                    <StatCell value={pct(p.ft_made, p.ft_att)} />
                    <td className="px-2 py-2 text-center text-sm font-bold text-cdpovoa-blue tabular-nums">
                      {p.efficiency}
                    </td>
                  </tr>
                ))}
                {/* Totais */}
                <tr className="bg-muted/50 font-bold border-t-2">
                  <td className="px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">Total</td>
                  <StatCell value={totPts} />
                  <StatCell value={totReb} />
                  <StatCell value={totAst} />
                  <StatCell value={totStl} />
                  <StatCell value={totBlk} />
                  <StatCell value={totTov} />
                  <StatCell value={pct(totFg2M, totFg2A)} />
                  <StatCell value={pct(totFg3M, totFg3A)} />
                  <StatCell value={pct(totFtM, totFtA)} />
                  <td className="px-2 py-2 text-center font-bold text-cdpovoa-blue">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Play-by-Play ─────────────────────────────────── */}
      {plays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Play-by-Play</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-72 overflow-y-auto">
            {[...plays].reverse().map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs py-0.5 border-b last:border-0">
                <span className="shrink-0 w-6 text-muted-foreground font-mono">{p.period}P</span>
                <span className={`flex-1 ${p.is_home_team ? "" : "text-muted-foreground italic"}`}>
                  {p.description ?? (EVENT_LABELS[p.event_type] ?? p.event_type)}
                </span>
                {p.points_delta > 0 && (
                  <span className={`font-bold shrink-0 ${p.is_home_team ? "text-green-600" : "text-red-500"}`}>
                    +{p.points_delta}
                  </span>
                )}
                <span className="text-muted-foreground shrink-0 tabular-nums font-mono">
                  {p.home_score_after}–{p.away_score_after}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const EVENT_LABELS: Partial<Record<string, string>> = {
  "2pt_made": "2P convertido", "2pt_miss": "2P falhado",
  "3pt_made": "3P convertido", "3pt_miss": "3P falhado",
  "ft_made": "LL convertido", "ft_miss": "LL falhado",
  "rebound_off": "Ressalto Of.", "rebound_def": "Ressalto Def.",
  "assist": "Assistência", "steal": "Roubo", "block": "Desarme",
  "turnover": "Turnover", "foul_committed": "Falta Cometida", "foul_drawn": "Falta Sofrida",
  "game_start": "🏀 Início do Jogo", "period_end": "Fim de Período", "game_end": "🏁 Fim do Jogo",
};
