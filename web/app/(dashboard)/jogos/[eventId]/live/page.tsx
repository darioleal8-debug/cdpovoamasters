"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveGame, formatClock } from "@/hooks/use-live-game";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play, Pause, RotateCcw, Undo2, BarChart2,
  ChevronRight, Flag, ArrowLeftRight, Eye,
} from "lucide-react";
import type { PlayerWithUser, PlayEventType } from "@/types/database";

// ─── Event labels ─────────────────────────────────────────
const EVENT_LABELS: Partial<Record<PlayEventType | string, string>> = {
  "2pt_made": "2P ✓", "2pt_miss": "2P ✗",
  "3pt_made": "3P ✓", "3pt_miss": "3P ✗",
  "ft_made": "LL ✓", "ft_miss": "LL ✗",
  "rebound_off": "Res.Of.", "rebound_def": "Res.Def.",
  "assist": "Assist.", "steal": "Roubo", "block": "Desarme",
  "turnover": "Turnover", "foul_committed": "Falta Com.",
  "foul_drawn": "Falta Sof.", "substitution_in": "Substituição",
  "timeout": "Timeout", "game_start": "Início", "period_end": "Fim Período",
  "game_end": "Fim Jogo",
};

// ─── Action definitions ───────────────────────────────────
interface Action {
  label: string;
  event: PlayEventType;
  color: string;
  pts?: number;
}

const ACTIONS: Action[] = [
  { label: "2P ✓", event: "2pt_made",       color: "bg-green-600 hover:bg-green-500",  pts: 2 },
  { label: "2P ✗", event: "2pt_miss",        color: "bg-green-900 hover:bg-green-800" },
  { label: "3P ✓", event: "3pt_made",        color: "bg-blue-600 hover:bg-blue-500",   pts: 3 },
  { label: "3P ✗", event: "3pt_miss",        color: "bg-blue-900 hover:bg-blue-800"  },
  { label: "LL ✓", event: "ft_made",         color: "bg-yellow-500 hover:bg-yellow-400", pts: 1 },
  { label: "LL ✗", event: "ft_miss",         color: "bg-yellow-800 hover:bg-yellow-700" },
  { label: "Res.O", event: "rebound_off",    color: "bg-purple-700 hover:bg-purple-600" },
  { label: "Res.D", event: "rebound_def",    color: "bg-purple-900 hover:bg-purple-800" },
  { label: "Assist", event: "assist",        color: "bg-teal-600 hover:bg-teal-500"   },
  { label: "Roubo", event: "steal",          color: "bg-orange-600 hover:bg-orange-500" },
  { label: "Desarme", event: "block",        color: "bg-orange-800 hover:bg-orange-700" },
  { label: "Turnover", event: "turnover",    color: "bg-red-700 hover:bg-red-600"     },
  { label: "F.Com.", event: "foul_committed", color: "bg-red-900 hover:bg-red-800"   },
  { label: "F.Sof.", event: "foul_drawn",    color: "bg-red-500 hover:bg-red-400"    },
];

// ─── Player card ──────────────────────────────────────────
function PlayerCard({
  player, stats, selected, subMode, onSelect,
}: {
  player: PlayerWithUser;
  stats?: { pts: number; fouls_committed: number };
  selected: boolean;
  subMode: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-2 min-w-[62px] border-2
        transition-all active:scale-95
        ${selected
          ? "bg-white text-cdpovoa-blue border-white font-bold shadow-lg scale-105"
          : subMode
            ? "bg-orange-500/80 border-orange-400 text-white hover:bg-orange-400"
            : "bg-white/10 border-white/20 hover:bg-white/20 text-white"
        }
      `}
    >
      <span className="text-xl font-black leading-none">{player.jersey_number ?? "–"}</span>
      <span className="text-[0.6rem] leading-tight text-center max-w-[54px] truncate">
        {player.user.name.split(" ")[0]}
      </span>
      {stats && (
        <span className={`text-[0.55rem] font-semibold ${selected ? "text-cdpovoa-blue/70" : "text-white/50"}`}>
          {stats.pts}pts
          {stats.fouls_committed >= 3 && (
            <span className="text-red-400 ml-0.5">{stats.fouls_committed}F</span>
          )}
        </span>
      )}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────
export default function LiveGamePage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();

  const {
    session, roster, onCourt, bench, plays, playerStats,
    clockSecs, loading, recording,
    startGame, startClock, stopClock, resetClock,
    recordPlay, recordOpponentPoints,
    substitutePlayer, callTimeout, undoLastPlay,
    nextPeriod, finishGame,
  } = useLiveGame(params.eventId);

  // ── UI state ─────────────────────────────────────────────
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithUser | null>(null);
  const [subPending, setSubPending] = useState<PlayerWithUser | null>(null); // bench player to enter
  const [assistPlayer, setAssistPlayer] = useState<string | null>(null);
  const [showAssistBar, setShowAssistBar] = useState(false);
  const assistTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  // Dialogs
  const [startDialog, setStartDialog] = useState(false);
  const [opponentName, setOpponentName] = useState("");
  const [startingFive, setStartingFive] = useState<string[]>([]);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [finishDialog, setFinishDialog] = useState(false);

  useEffect(() => {
    if (!loading && !session) setStartDialog(true);
  }, [loading, session]);

  // ── Action handler ────────────────────────────────────────
  async function handleAction(action: Action) {
    if (!selectedPlayer) return;
    const ok = await recordPlay({
      event_type: action.event,
      player_id: selectedPlayer.user_id,
    });
    if (!ok) return;

    if (action.event.endsWith("_made") && action.pts && action.pts >= 2) {
      setShowAssistBar(true);
      if (assistTimerRef[0]) clearTimeout(assistTimerRef[0]);
      assistTimerRef[0] = setTimeout(() => {
        setShowAssistBar(false);
        setAssistPlayer(null);
      }, 6000);
    }
    setSelectedPlayer(null);
  }

  async function handleAssist() {
    if (!assistPlayer || !session) return;
    await recordPlay({ event_type: "assist", player_id: assistPlayer });
    setAssistPlayer(null);
    setShowAssistBar(false);
  }

  // ── Substitution flow ─────────────────────────────────────
  function handleBenchTap(p: PlayerWithUser) {
    setSubPending((prev) => prev?.user_id === p.user_id ? null : p);
    setSelectedPlayer(null);
  }

  async function handleCourtTapForSub(p: PlayerWithUser) {
    if (!subPending) return;
    await substitutePlayer(subPending.user_id, p.user_id);
    setSubPending(null);
  }

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-cdpovoa-blue p-4 space-y-4">
        <Skeleton className="h-24 w-full rounded-xl bg-white/10" />
        <Skeleton className="h-48 w-full rounded-xl bg-white/10" />
      </div>
    );
  }

  const isLive = session?.status === "live";
  const isFinished = session?.status === "finished";
  const clockRunning = session?.clock_running ?? false;

  return (
    <div className="min-h-screen bg-cdpovoa-blue text-white flex flex-col select-none">

      {/* ── HEADER: Score + Clock ─────────────────────── */}
      <header className="sticky top-0 z-20 bg-cdpovoa-blue border-b border-white/10">
        {/* Top row: nav + controls */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <button onClick={() => router.push(`/jogos/${params.eventId}/stats`)}
            className="text-white/50 hover:text-white p-1 rounded">
            <BarChart2 className="h-4 w-4" />
          </button>
          <button onClick={() => router.push(`/live/${session?.id}`)}
            className="text-white/50 hover:text-white p-1 rounded" title="Vista pública">
            <Eye className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          {isLive && (
            <>
              <button onClick={undoLastPlay} disabled={recording}
                className="text-white/50 hover:text-red-400 p-1 rounded disabled:opacity-30" title="Desfazer">
                <Undo2 className="h-4 w-4" />
              </button>
              <button onClick={() => callTimeout("home")}
                className="text-[0.6rem] font-bold bg-white/10 hover:bg-white/20 rounded px-2 py-0.5">
                T.{session?.home_timeouts_left ?? 4}
              </button>
              <button onClick={() => callTimeout("away")}
                className="text-[0.6rem] font-bold bg-white/10 hover:bg-white/20 rounded px-2 py-0.5">
                ADV.T{session?.away_timeouts_left ?? 4}
              </button>
            </>
          )}
        </div>

        {/* Score row */}
        <div className="flex items-center justify-between px-4 py-1">
          <div className="text-center flex-1">
            <p className="text-[0.6rem] uppercase tracking-widest text-white/40">CD Póvoa</p>
            <p className="text-5xl font-black tabular-nums leading-none">{session?.home_score ?? 0}</p>
          </div>

          <div className="flex flex-col items-center gap-0.5 px-2">
            <Badge className={`text-[0.6rem] px-2 py-0.5 ${isLive ? "bg-green-500" : isFinished ? "bg-white/20" : "bg-amber-500"}`}>
              {isLive ? "● LIVE" : isFinished ? "FINAL" : "Por iniciar"}
            </Badge>
            <span className="text-sm font-bold">{session?.current_period ?? 1}ºP</span>
          </div>

          <div className="text-center flex-1">
            <p className="text-[0.6rem] uppercase tracking-widest text-white/40 truncate max-w-[90px] mx-auto">
              {session?.opponent_name ?? "Adversário"}
            </p>
            <p className="text-5xl font-black tabular-nums leading-none">{session?.away_score ?? 0}</p>
          </div>
        </div>

        {/* Clock row */}
        {isLive && (
          <div className="flex items-center justify-center gap-3 pb-2 px-3">
            <span className={`text-2xl font-mono font-black tabular-nums ${clockSecs <= 30 ? "text-red-400" : "text-white"}`}>
              {formatClock(clockSecs)}
            </span>
            <button
              onClick={clockRunning ? stopClock : startClock}
              className={`rounded-full p-1.5 ${clockRunning ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}
            >
              {clockRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button onClick={resetClock}
              className="rounded-full p-1.5 bg-white/10 hover:bg-white/20">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* ── Finished state ────────────────────────────────── */}
      {isFinished && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="text-6xl">🏁</span>
          <h2 className="text-2xl font-bold">Jogo Terminado</h2>
          <p className="text-white/60">
            CD Póvoa {session?.home_score} — {session?.away_score} {session?.opponent_name}
          </p>
          <Button className="bg-white text-cdpovoa-blue font-bold"
            onClick={() => router.push(`/jogos/${params.eventId}/stats`)}>
            <BarChart2 className="mr-2 h-4 w-4" /> Ver Box Score
          </Button>
        </div>
      )}

      {/* ── Live UI ───────────────────────────────────────── */}
      {isLive && (
        <div className="flex-1 flex flex-col overflow-y-auto">

          {/* Assist bar */}
          {showAssistBar && (
            <div className="bg-teal-700 px-3 py-2 flex items-center gap-2 animate-pulse">
              <span className="text-xs font-semibold text-white/80">Assistência?</span>
              <div className="flex gap-1.5 flex-1 overflow-x-auto">
                {roster.filter((p) => p.user_id !== selectedPlayer?.user_id).map((p) => (
                  <button key={p.user_id}
                    onClick={() => setAssistPlayer(p.user_id === assistPlayer ? null : p.user_id)}
                    className={`shrink-0 text-xs rounded px-2 py-0.5 border transition-all ${
                      assistPlayer === p.user_id
                        ? "bg-white text-teal-700 border-white font-bold"
                        : "border-white/40 text-white/80 hover:border-white"
                    }`}>
                    {p.jersey_number}
                  </button>
                ))}
              </div>
              {assistPlayer && (
                <button onClick={handleAssist}
                  className="shrink-0 text-xs bg-white text-teal-700 font-bold rounded px-2 py-1">
                  OK
                </button>
              )}
              <button onClick={() => { setShowAssistBar(false); setAssistPlayer(null); }}
                className="shrink-0 text-white/50 hover:text-white text-xs px-1">✕</button>
            </div>
          )}

          {/* Sub pending banner */}
          {subPending && (
            <div className="bg-orange-600 px-3 py-2 text-sm font-semibold text-center">
              #{subPending.jersey_number} {subPending.user.name.split(" ")[0]} vai entrar →
              <span className="text-orange-200"> toca num jogador em campo para substituir</span>
            </div>
          )}

          {/* ON COURT players */}
          <section className="px-3 pt-3">
            <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-2">
              Em Campo ({onCourt.length}/5)
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {onCourt.map((p) => {
                const st = playerStats.find((s) => s.player_id === p.user_id);
                return (
                  <PlayerCard
                    key={p.user_id}
                    player={p}
                    stats={st ? { pts: st.pts, fouls_committed: st.fouls_committed } : undefined}
                    selected={selectedPlayer?.user_id === p.user_id}
                    subMode={!!subPending}
                    onSelect={() => {
                      if (subPending) {
                        handleCourtTapForSub(p);
                      } else {
                        setSelectedPlayer((prev) =>
                          prev?.user_id === p.user_id ? null : p
                        );
                      }
                    }}
                  />
                );
              })}
              {onCourt.length === 0 && (
                <p className="text-white/30 text-xs italic py-2">
                  Seleciona 5 jogadores ao iniciar o jogo
                </p>
              )}
            </div>
          </section>

          {/* ACTION PAD — only when player selected */}
          {selectedPlayer && !subPending && (
            <section className="px-3 pt-2 pb-1">
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-2">
                #{selectedPlayer.jersey_number} {selectedPlayer.user.name.split(" ")[0]}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {ACTIONS.map((action) => (
                  <button
                    key={action.event}
                    disabled={recording}
                    onClick={() => handleAction(action)}
                    className={`${action.color} disabled:opacity-40 rounded-xl py-3 text-xs font-bold text-white text-center active:scale-95 transition-all`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Opponent points */}
          <section className="px-3 pt-2 pb-1">
            <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-2">Adversário</p>
            <div className="flex gap-2">
              {[1, 2, 3].map((pts) => (
                <button key={pts}
                  onClick={() => recordOpponentPoints(pts)}
                  className="flex-1 bg-white/10 hover:bg-white/20 rounded-xl py-2.5 text-sm font-bold text-white/80 active:scale-95 transition-all">
                  +{pts}
                </button>
              ))}
            </div>
          </section>

          {/* BENCH */}
          {bench.length > 0 && (
            <section className="px-3 pt-2 pb-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[0.6rem] uppercase tracking-widest text-white/40">Banco</p>
                <ArrowLeftRight className="h-3 w-3 text-orange-400" />
                <span className="text-[0.6rem] text-orange-400">Toca para substituir</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {bench.map((p) => {
                  const st = playerStats.find((s) => s.player_id === p.user_id);
                  return (
                    <button
                      key={p.user_id}
                      onClick={() => handleBenchTap(p)}
                      className={`shrink-0 flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 min-w-[52px] border-2 transition-all active:scale-95 ${
                        subPending?.user_id === p.user_id
                          ? "bg-orange-500 border-orange-300 font-bold scale-105"
                          : "bg-white/5 border-white/10 hover:bg-white/15"
                      }`}
                    >
                      <span className="text-base font-black leading-none">{p.jersey_number ?? "–"}</span>
                      <span className="text-[0.55rem] text-white/50 truncate max-w-[44px]">
                        {p.user.name.split(" ")[0]}
                      </span>
                      {st && <span className="text-[0.5rem] text-white/30">{st.pts}pts</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* PLAY LOG */}
          {plays.length > 0 && (
            <section className="px-3 pt-2 pb-3">
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-1.5">Últimos eventos</p>
              <div className="space-y-0.5">
                {plays.slice(0, 6).map((p, i) => {
                  const playerName = roster.find((r) => r.user_id === p.player_id)?.user.name.split(" ")[0] ?? "";
                  const label = EVENT_LABELS[p.event_type] ?? p.event_type;
                  return (
                    <div key={p.id}
                      className={`flex items-center gap-2 text-xs py-0.5 ${i === 0 ? "text-white/80" : "text-white/40"}`}>
                      <span className="shrink-0 w-5 tabular-nums">{p.period}P</span>
                      {p.game_clock && <span className="shrink-0 text-white/30 font-mono">{p.game_clock}</span>}
                      {playerName && <span className="font-semibold shrink-0">#{roster.find((r) => r.user_id === p.player_id)?.jersey_number} {playerName}</span>}
                      <span className="flex-1 truncate">{label}</span>
                      {p.points_delta > 0 && (
                        <span className={`font-bold shrink-0 ${p.is_home_team ? "text-green-400" : "text-red-400"}`}>
                          +{p.points_delta}
                        </span>
                      )}
                      <span className="shrink-0 text-white/30 tabular-nums font-mono text-[0.6rem]">
                        {p.home_score_after}–{p.away_score_after}
                      </span>
                    </div>
                  );
                })}
                <button onClick={() => router.push(`/jogos/${params.eventId}/stats`)}
                  className="text-xs text-white/30 hover:text-white/60 mt-1 underline">
                  Ver box score completo →
                </button>
              </div>
            </section>
          )}

          {/* Game controls */}
          <section className="px-3 pb-6">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline"
                className="border-white/30 text-white bg-transparent hover:bg-white/10"
                onClick={() => setPeriodDialog(true)}>
                <ChevronRight className="mr-1.5 h-4 w-4" />
                Próximo Período
              </Button>
              <Button variant="outline"
                className="border-red-500/60 text-red-400 bg-transparent hover:bg-red-500/10"
                onClick={() => setFinishDialog(true)}>
                <Flag className="mr-1.5 h-4 w-4" />
                Terminar Jogo
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* ── DIALOG: Iniciar Jogo ──────────────────────── */}
      <Dialog open={startDialog} onOpenChange={(v) => { if (session) setStartDialog(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🏀 Iniciar Jogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do adversário</Label>
              <Input
                placeholder="Lions BC"
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quinteto inicial (seleciona 5)</Label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {roster.map((p) => (
                  <button key={p.user_id}
                    onClick={() => setStartingFive((prev) =>
                      prev.includes(p.user_id)
                        ? prev.filter((id) => id !== p.user_id)
                        : prev.length < 5 ? [...prev, p.user_id] : prev
                    )}
                    className={`text-xs rounded-md px-2.5 py-1.5 border transition-all ${
                      startingFive.includes(p.user_id)
                        ? "bg-cdpovoa-blue text-white border-cdpovoa-blue font-bold"
                        : "border-border hover:border-cdpovoa-blue"
                    }`}>
                    #{p.jersey_number} {p.user.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{startingFive.length}/5 selecionados</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={recording}
              onClick={async () => {
                const ok = await startGame(opponentName || "Adversário", startingFive);
                if (ok) setStartDialog(false);
              }}>
              {recording ? "A iniciar…" : "Iniciar Jogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Próximo Período ───────────────────── */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Próximo Período</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Terminar o {session?.current_period}º período e avançar para o {(session?.current_period ?? 0) + 1}º?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialog(false)}>Cancelar</Button>
            <Button onClick={async () => { await nextPeriod(); setPeriodDialog(false); }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Terminar Jogo ─────────────────────── */}
      <Dialog open={finishDialog} onOpenChange={setFinishDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Terminar Jogo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            CD Póvoa <strong>{session?.home_score}</strong> –{" "}
            <strong>{session?.away_score}</strong> {session?.opponent_name}
            <br />Confirmas o resultado final?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              const ok = await finishGame();
              if (ok) setFinishDialog(false);
            }} disabled={recording}>
              🏁 Terminar Jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
