"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveGame } from "@/hooks/use-live-game";
import { generateGamePDF } from "@/lib/pdf-export";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Radio, Trophy, Download, Eye } from "lucide-react";
import type { PlayerGameStatsWithUser, PlayEventType } from "@/types/database";

function pct(made: number, att: number) {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : "—";
}

function secsToMin(secs: number) {
  if (!secs) return "–";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function StatCell({ value, bold, highlight }: { value: string | number; bold?: boolean; highlight?: boolean }) {
  return (
    <td className={`px-2 py-2 text-center text-sm tabular-nums ${bold ? "font-bold" : ""} ${highlight ? "text-cdpovoa-blue font-bold" : ""}`}>
      {value}
    </td>
  );
}

function getMvp(stats: PlayerGameStatsWithUser[]): PlayerGameStatsWithUser | null {
  if (!stats.length) return null;
  return [...stats].sort((a, b) => Number(b.efficiency) - Number(a.efficiency))[0];
}

const EVENT_LABELS: Partial<Record<PlayEventType | string, string>> = {
  "2pt_made": "2P ✓", "2pt_miss": "2P ✗",
  "3pt_made": "3P ✓", "3pt_miss": "3P ✗",
  "ft_made": "LL ✓", "ft_miss": "LL ✗",
  "rebound_off": "Res.Of.", "rebound_def": "Res.Def.",
  "assist": "Assist.", "steal": "Roubo", "block": "Desarme",
  "turnover": "Turnover", "foul_committed": "F.Cometida", "foul_drawn": "F.Sofrida",
  "substitution_in": "Substituição", "timeout": "Timeout",
  "game_start": "🏀 Início", "period_end": "Fim Período", "game_end": "🏁 Fim Jogo",
};

export default function GameStatsPage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const [pdfLoading, setPdfLoading] = useState(false);

  const { session, plays, playerStats, periodScores, roster, loading } =
    useLiveGame(params.eventId);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
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
  const sortedStats = [...playerStats].sort((a, b) => b.pts - a.pts);

  const tot2M  = playerStats.reduce((s, p) => s + p.fg2_made, 0);
  const tot2A  = playerStats.reduce((s, p) => s + p.fg2_att, 0);
  const tot3M  = playerStats.reduce((s, p) => s + p.fg3_made, 0);
  const tot3A  = playerStats.reduce((s, p) => s + p.fg3_att, 0);
  const totFtM = playerStats.reduce((s, p) => s + p.ft_made, 0);
  const totFtA = playerStats.reduce((s, p) => s + p.ft_att, 0);
  const totPts = playerStats.reduce((s, p) => s + p.pts, 0);
  const totReb = playerStats.reduce((s, p) => s + p.reb_off + p.reb_def, 0);
  const totAst = playerStats.reduce((s, p) => s + p.ast, 0);
  const totStl = playerStats.reduce((s, p) => s + p.stl, 0);
  const totBlk = playerStats.reduce((s, p) => s + p.blk, 0);
  const totTov = playerStats.reduce((s, p) => s + p.tov, 0);
  const totFC  = playerStats.reduce((s, p) => s + p.fouls_committed, 0);
  const totFD  = playerStats.reduce((s, p) => s + p.fouls_drawn, 0);

  async function handlePDF() {
    setPdfLoading(true);
    try {
      const statsWithExtras = sortedStats.map((s) => {
        const profile = roster.find((r) => r.user_id === s.player_id);
        return { ...s, jersey_number: profile?.jersey_number ?? null };
      });
      await generateGamePDF(session!, statsWithExtras, periodScores);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Box Score</h1>
          <p className="text-sm text-muted-foreground">CD Póvoa vs {session.opponent_name}</p>
        </div>
        <div className="flex gap-2">
          {session.status === "live" && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700"
              onClick={() => router.push(`/jogos/${params.eventId}/live`)}>
              <Radio className="mr-1 h-3.5 w-3.5" /> Live
            </Button>
          )}
          <Button size="sm" variant="outline"
            onClick={() => router.push(`/live/${session.id}`)}
            title="Vista pública">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={handlePDF} disabled={pdfLoading}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {pdfLoading ? "…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* ── Score card ─────────────────────────────────── */}
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

          {/* Period scores */}
          {periodScores.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex text-xs text-white/50 mb-1">
                <span className="w-24" />
                {periodScores.map((p) => (
                  <span key={p.period} className="flex-1 text-center">P{p.period}</span>
                ))}
                <span className="flex-1 text-center font-bold text-white">Tot</span>
              </div>
              <div className="flex text-xs">
                <span className="w-24 text-white/60">CD Póvoa</span>
                {periodScores.map((p) => (
                  <span key={p.period} className="flex-1 text-center text-white tabular-nums">{p.home_score}</span>
                ))}
                <span className="flex-1 text-center font-bold text-white tabular-nums">{session.home_score}</span>
              </div>
              <div className="flex text-xs mt-0.5">
                <span className="w-24 text-white/60 truncate">{session.opponent_name}</span>
                {periodScores.map((p) => (
                  <span key={p.period} className="flex-1 text-center text-white/70 tabular-nums">{p.away_score}</span>
                ))}
                <span className="flex-1 text-center font-bold text-white/70 tabular-nums">{session.away_score}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MVP ────────────────────────────────────────── */}
      {mvp && session.status === "finished" && (
        <Card className="border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500 shrink-0" />
            <div>
              <p className="text-xs text-yellow-700 font-semibold uppercase tracking-widest">MVP do Jogo</p>
              <p className="font-bold">{mvp.user.name}</p>
              <p className="text-xs text-muted-foreground">
                {mvp.pts} pts · {mvp.reb_off + mvp.reb_def} reb · {mvp.ast} ast ·
                EFF {Number(mvp.efficiency).toFixed(0)} ·
                +/- {mvp.plus_minus >= 0 ? `+${mvp.plus_minus}` : mvp.plus_minus}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Totais ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Totais da Equipa</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Pontos",    value: totPts },
              { label: "Reb.",      value: totReb },
              { label: "Assist.",   value: totAst },
              { label: "Roubos",    value: totStl },
              { label: "Desarmes",  value: totBlk },
              { label: "Turnovers", value: totTov },
              { label: "F.Com.",    value: totFC  },
              { label: "F.Sof.",    value: totFD  },
              { label: "2P %",  value: pct(tot2M, tot2A) },
              { label: "3P %",  value: pct(tot3M, tot3A) },
              { label: "LL %",  value: pct(totFtM, totFtA) },
              { label: "FG %",  value: pct(tot2M + tot3M, tot2A + tot3A) },
            ].map((stat) => (
              <div key={stat.label} className="bg-muted/50 rounded-lg p-2">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Box Score ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Box Score Individual</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/50">#</th>
                  <th className="text-left px-2 py-2 font-semibold min-w-[90px]">Jogador</th>
                  <th className="px-2 py-2 text-center font-semibold">MIN</th>
                  <th className="px-2 py-2 text-center font-semibold">PTS</th>
                  <th className="px-2 py-2 text-center font-semibold">REB</th>
                  <th className="px-2 py-2 text-center font-semibold">AST</th>
                  <th className="px-2 py-2 text-center font-semibold">STL</th>
                  <th className="px-2 py-2 text-center font-semibold">BLK</th>
                  <th className="px-2 py-2 text-center font-semibold">TOV</th>
                  <th className="px-2 py-2 text-center font-semibold">FC</th>
                  <th className="px-2 py-2 text-center font-semibold">FD</th>
                  <th className="px-2 py-2 text-center font-semibold">2P%</th>
                  <th className="px-2 py-2 text-center font-semibold">3P%</th>
                  <th className="px-2 py-2 text-center font-semibold">LL%</th>
                  <th className="px-2 py-2 text-center font-semibold text-cdpovoa-blue">EFF</th>
                  <th className="px-2 py-2 text-center font-semibold">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedStats.map((p) => {
                  const profile = roster.find((r) => r.user_id === p.player_id);
                  const pm = p.plus_minus ?? 0;
                  return (
                    <tr key={p.player_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold sticky left-0 bg-background">
                        {profile?.jersey_number ?? "–"}
                      </td>
                      <td className="px-2 py-2 font-medium max-w-[90px] truncate">
                        {p.user.name.split(" ").slice(0, 2).join(" ")}
                      </td>
                      <StatCell value={secsToMin((p as any).seconds_played ?? 0)} />
                      <StatCell value={p.pts} bold={p.pts >= 10} />
                      <StatCell value={p.reb_off + p.reb_def} />
                      <StatCell value={p.ast} />
                      <StatCell value={p.stl} />
                      <StatCell value={p.blk} />
                      <StatCell value={p.tov} />
                      <StatCell value={p.fouls_committed} />
                      <StatCell value={p.fouls_drawn} />
                      <StatCell value={pct(p.fg2_made, p.fg2_att)} />
                      <StatCell value={pct(p.fg3_made, p.fg3_att)} />
                      <StatCell value={pct(p.ft_made, p.ft_att)} />
                      <td className="px-2 py-2 text-center font-bold text-cdpovoa-blue tabular-nums">
                        {Number(p.efficiency).toFixed(0)}
                      </td>
                      <td className={`px-2 py-2 text-center text-sm tabular-nums font-semibold ${pm > 0 ? "text-green-600" : pm < 0 ? "text-red-500" : ""}`}>
                        {pm > 0 ? `+${pm}` : pm}
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="bg-muted/50 font-bold border-t-2">
                  <td className="px-3 py-2 sticky left-0 bg-muted/50">–</td>
                  <td className="px-2 py-2 text-xs uppercase tracking-widest text-muted-foreground">Total</td>
                  <StatCell value="–" />
                  <StatCell value={totPts} bold />
                  <StatCell value={totReb} bold />
                  <StatCell value={totAst} bold />
                  <StatCell value={totStl} bold />
                  <StatCell value={totBlk} bold />
                  <StatCell value={totTov} bold />
                  <StatCell value={totFC} bold />
                  <StatCell value={totFD} bold />
                  <StatCell value={pct(tot2M, tot2A)} bold />
                  <StatCell value={pct(tot3M, tot3A)} bold />
                  <StatCell value={pct(totFtM, totFtA)} bold />
                  <td className="px-2 py-2 text-center font-bold text-cdpovoa-blue">–</td>
                  <td className="px-2 py-2 text-center">–</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Play-by-Play ────────────────────────────────── */}
      {plays.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Play-by-Play</CardTitle></CardHeader>
          <CardContent className="space-y-0.5 max-h-80 overflow-y-auto p-3">
            {[...plays].reverse().map((p) => {
              const playerName = roster.find((r) => r.user_id === p.player_id)
                ?.user.name.split(" ")[0];
              const jersey = roster.find((r) => r.user_id === p.player_id)?.jersey_number;
              return (
                <div key={p.id} className="flex items-center gap-2 text-xs py-0.5 border-b last:border-0">
                  <span className="shrink-0 w-5 text-muted-foreground font-mono">{p.period}P</span>
                  {p.game_clock && (
                    <span className="shrink-0 text-muted-foreground font-mono text-[0.6rem]">{p.game_clock}</span>
                  )}
                  {jersey !== undefined && (
                    <span className="shrink-0 font-bold text-cdpovoa-blue">#{jersey}</span>
                  )}
                  {playerName && <span className="shrink-0 font-medium">{playerName}</span>}
                  <span className={`flex-1 truncate ${p.is_home_team ? "" : "text-muted-foreground italic"}`}>
                    {p.description ?? (EVENT_LABELS[p.event_type] ?? p.event_type)}
                  </span>
                  {p.points_delta > 0 && (
                    <span className={`font-bold shrink-0 ${p.is_home_team ? "text-green-600" : "text-red-500"}`}>
                      +{p.points_delta}
                    </span>
                  )}
                  <span className="text-muted-foreground shrink-0 tabular-nums font-mono text-[0.6rem]">
                    {p.home_score_after}–{p.away_score_after}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
