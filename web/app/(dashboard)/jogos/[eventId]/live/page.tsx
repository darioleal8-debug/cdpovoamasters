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
  ChevronRight, Flag, Eye, Pencil,
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
  description?: string;
}

const ACTIONS: Action[] = [
  { label: "2P ✓",   event: "2pt_made",       color: "bg-green-600 hover:bg-green-500",    pts: 2 },
  { label: "2P ✗",   event: "2pt_miss",        color: "bg-green-900 hover:bg-green-800" },
  { label: "3P ✓",   event: "3pt_made",        color: "bg-blue-600 hover:bg-blue-500",      pts: 3 },
  { label: "3P ✗",   event: "3pt_miss",        color: "bg-blue-900 hover:bg-blue-800" },
  { label: "LL ✓",   event: "ft_made",         color: "bg-yellow-500 hover:bg-yellow-400",  pts: 1 },
  { label: "LL ✗",   event: "ft_miss",         color: "bg-yellow-800 hover:bg-yellow-700" },
  { label: "Res.Of.", event: "rebound_off",    color: "bg-purple-700 hover:bg-purple-600" },
  { label: "Res.Def.", event: "rebound_def",   color: "bg-purple-900 hover:bg-purple-800" },
  { label: "Assist", event: "assist",          color: "bg-teal-600 hover:bg-teal-500" },
  { label: "Roubo",  event: "steal",           color: "bg-orange-600 hover:bg-orange-500" },
  { label: "Bloco",  event: "block",           color: "bg-orange-800 hover:bg-orange-700" },
  { label: "Perda",  event: "turnover",        color: "bg-red-700 hover:bg-red-600" },
  { label: "F.Def.", event: "foul_committed",  color: "bg-rose-800 hover:bg-rose-700",  description: "Falta Defensiva" },
  { label: "F.Of.",  event: "foul_committed",  color: "bg-rose-900 hover:bg-rose-800",  description: "Falta Ofensiva" },
  { label: "F.Téc.", event: "foul_committed",  color: "bg-red-800 hover:bg-red-700",    description: "Falta Técnica" },
  { label: "F.AD",   event: "foul_committed",  color: "bg-red-900 hover:bg-red-800",    description: "Falta Anti-Desportiva" },
  { label: "F.Sof.", event: "foul_drawn",      color: "bg-red-500 hover:bg-red-400" },
];

// ─── Player card ──────────────────────────────────────────
function PlayerCard({
  player, stats, selected, isOnCourt, onSelect,
}: {
  player: PlayerWithUser;
  stats?: { pts: number; fouls_committed: number };
  selected: boolean;
  isOnCourt?: boolean;
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
          : isOnCourt
            ? "bg-green-700/40 border-green-500/60 text-white hover:bg-green-600/50"
            : "bg-white/10 border-white/20 hover:bg-white/20 text-white/60"
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
      {isOnCourt && !selected && (
        <span className="w-1 h-1 rounded-full bg-green-400 mt-0.5" />
      )}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────
export default function LiveGamePage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();

  const {
    session, roster, onCourt, plays, playerStats,
    clockSecs, loading, recording,
    startGame, startClock, stopClock, resetClock,
    recordPlay, recordOpponentPoints,
    setLineup, callTimeout, undoLastPlay,
    nextPeriod, finishGame,
  } = useLiveGame(params.eventId);

  // ── UI state ─────────────────────────────────────────────
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithUser | null>(null);
  const [assistPlayer, setAssistPlayer] = useState<string | null>(null);
  const [showAssistBar, setShowAssistBar] = useState(false);
  const assistTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const [homeScorePending, setHomeScorePending] = useState<1 | 2 | 3 | null>(null);

  // Dialogs
  const [startDialog, setStartDialog] = useState(false);
  const [opponentName, setOpponentName] = useState("");
  const [startingFive, setStartingFive] = useState<string[]>([]);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [finishDialog, setFinishDialog] = useState(false);
  const [lineupDialog, setLineupDialog] = useState(false);
  const [lineupSel, setLineupSel] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !session) setStartDialog(true);
  }, [loading, session]);

  // ── Action handler ────────────────────────────────────────
  async function handleAction(action: Action) {
    if (!selectedPlayer) return;
    const ok = await recordPlay({
      event_type: action.event,
      player_id: selectedPlayer.user_id,
      description: action.description,
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

  async function handleHomeScore(pts: 1 | 2 | 3, playerId: string | null) {
    const eventType: PlayEventType = pts === 1 ? "ft_made" : pts === 2 ? "2pt_made" : "3pt_made";
    await recordPlay({ event_type: eventType, player_id: playerId ?? undefined });
    setHomeScorePending(null);
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
        <div className="flex-1 overflow-y-auto">
          {/* Final score */}
          <div className="text-center py-5">
            <div className="text-4xl mb-1">🏁</div>
            <h2 className="text-lg font-bold">Jogo Terminado</h2>
            <div className="flex items-center justify-center gap-6 mt-3">
              <div className="text-center">
                <p className="text-[0.6rem] text-white/40 uppercase tracking-widest">CD Póvoa</p>
                <p className="text-5xl font-black tabular-nums">{session?.home_score ?? 0}</p>
              </div>
              <span className="text-white/20 text-2xl">—</span>
              <div className="text-center">
                <p className="text-[0.6rem] text-white/40 uppercase tracking-widest truncate max-w-[90px]">
                  {session?.opponent_name ?? "Adversário"}
                </p>
                <p className="text-5xl font-black tabular-nums">{session?.away_score ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Individual stats */}
          {playerStats.length > 0 && (
            <div className="px-2 pb-4">
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-2 px-1">
                Estatísticas Individuais
              </p>
              <div className="overflow-x-auto rounded-xl bg-white/5">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="text-[0.6rem] text-white/40 border-b border-white/10 uppercase tracking-wide">
                      <th className="sticky left-0 bg-white/5 text-left px-3 py-2 min-w-[100px]">Jogador</th>
                      <th className="text-center px-2 py-2 min-w-[38px]">T</th>
                      <th className="text-center px-2 py-2 min-w-[28px] text-yellow-400">Pts</th>
                      <th className="text-center px-2 py-2 min-w-[38px]">2P</th>
                      <th className="text-center px-2 py-2 min-w-[38px]">3P</th>
                      <th className="text-center px-2 py-2 min-w-[38px]">LL</th>
                      <th className="text-center px-2 py-2 min-w-[28px]">Reb</th>
                      <th className="text-center px-2 py-2 min-w-[28px]">Ass</th>
                      <th className="text-center px-2 py-2 min-w-[28px]">Rou</th>
                      <th className="text-center px-2 py-2 min-w-[28px]">Des</th>
                      <th className="text-center px-2 py-2 min-w-[28px] text-red-400">FC</th>
                      <th className="text-center px-2 py-2 min-w-[28px] text-orange-400">FS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...playerStats]
                      .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
                      .map((s) => {
                        const player = roster.find((p) => p.user_id === s.player_id);
                        if (!player) return null;
                        const secs = s.seconds_played ?? 0;
                        const timeStr = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
                        return (
                          <tr key={s.player_id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="sticky left-0 bg-cdpovoa-blue px-3 py-2">
                              <span className="text-white/30 mr-1 text-[0.6rem]">#{player.jersey_number}</span>
                              <span className="font-semibold">{player.user.name.split(" ")[0]}</span>
                            </td>
                            <td className="text-center px-2 py-2 font-mono text-white/50">{timeStr}</td>
                            <td className="text-center px-2 py-2 font-black text-yellow-400">{s.pts ?? 0}</td>
                            <td className="text-center px-2 py-2 text-white/60">{s.fg2_made ?? 0}/{s.fg2_att ?? 0}</td>
                            <td className="text-center px-2 py-2 text-white/60">{s.fg3_made ?? 0}/{s.fg3_att ?? 0}</td>
                            <td className="text-center px-2 py-2 text-white/60">{s.ft_made ?? 0}/{s.ft_att ?? 0}</td>
                            <td className="text-center px-2 py-2">{(s.reb_off ?? 0) + (s.reb_def ?? 0)}</td>
                            <td className="text-center px-2 py-2">{s.ast ?? 0}</td>
                            <td className="text-center px-2 py-2">{s.stl ?? 0}</td>
                            <td className="text-center px-2 py-2">{s.blk ?? 0}</td>
                            <td className="text-center px-2 py-2 text-red-400">{s.fouls_committed ?? 0}</td>
                            <td className="text-center px-2 py-2 text-orange-400">{s.fouls_drawn ?? 0}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="px-3 pb-8">
            <Button className="w-full bg-white text-cdpovoa-blue font-bold"
              onClick={() => router.push(`/jogos/${params.eventId}/stats`)}>
              <BarChart2 className="mr-2 h-4 w-4" /> Ver Box Score Completo
            </Button>
          </div>
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

          {/* Home score player picker */}
          {homeScorePending !== null && (
            <div className="bg-green-900 px-3 py-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-white/80 shrink-0">
                +{homeScorePending} — Quem marcou?
              </span>
              <div className="flex gap-1.5 flex-1 overflow-x-auto">
                {roster.map((p) => (
                  <button
                    key={p.user_id}
                    disabled={recording}
                    onClick={() => handleHomeScore(homeScorePending, p.user_id)}
                    className={`shrink-0 text-xs rounded px-2 py-0.5 border transition-all disabled:opacity-40 ${
                      onCourt.some((c) => c.user_id === p.user_id)
                        ? "border-green-400/70 text-white hover:bg-white/20"
                        : "border-white/20 text-white/50 hover:bg-white/10"
                    }`}>
                    #{p.jersey_number}
                  </button>
                ))}
              </div>
              <button
                disabled={recording}
                onClick={() => handleHomeScore(homeScorePending, null)}
                className="shrink-0 text-[0.65rem] bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1 disabled:opacity-40">
                Sem jogador
              </button>
              <button
                onClick={() => setHomeScorePending(null)}
                className="shrink-0 text-white/50 hover:text-white text-xs px-1">✕</button>
            </div>
          )}

          {/* ALL players — tappable for stats, on-court players highlighted */}
          <section className="px-3 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40">
                Jogadores
              </p>
              <span className="text-[0.6rem] text-green-400/70">
                {onCourt.length}/5 em campo
              </span>
              <button
                onClick={() => { setLineupSel(onCourt.map((p) => p.user_id)); setLineupDialog(true); }}
                className="text-white/30 hover:text-white/70 transition-colors ml-auto"
                title="Definir 5 em campo">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {roster.length === 0 && (
                <p className="text-white/30 text-xs italic py-2">
                  Sem jogadores convocados.
                </p>
              )}
              {roster.map((p) => {
                const st = playerStats.find((s) => s.player_id === p.user_id);
                const isOnCourt = onCourt.some((c) => c.user_id === p.user_id);
                return (
                  <PlayerCard
                    key={p.user_id}
                    player={p}
                    stats={st ? { pts: st.pts ?? 0, fouls_committed: st.fouls_committed ?? 0 } : undefined}
                    selected={selectedPlayer?.user_id === p.user_id}
                    isOnCourt={isOnCourt}
                    onSelect={() => {
                      setHomeScorePending(null);
                      setSelectedPlayer((prev) =>
                        prev?.user_id === p.user_id ? null : p
                      );
                    }}
                  />
                );
              })}
            </div>
            {onCourt.length === 0 && roster.length > 0 && (
              <button
                onClick={() => { setLineupSel([]); setLineupDialog(true); }}
                className="text-orange-400 hover:text-orange-300 text-xs flex items-center gap-1.5 py-1 transition-colors">
                <Pencil className="h-3 w-3" />
                Definir 5 inicial
              </button>
            )}
          </section>

          {/* ACTION PAD — only when player selected */}
          {selectedPlayer && (
            <section className="px-3 pt-2 pb-1">
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-2">
                #{selectedPlayer.jersey_number} {selectedPlayer.user.name.split(" ")[0]}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {ACTIONS.map((action) => (
                  <button
                    key={action.label}
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

          {/* CD Póvoa quick scoring */}
          <section className="px-3 pt-2 pb-1">
            <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-2">CD Póvoa</p>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((pts) => (
                <button
                  key={pts}
                  disabled={recording}
                  onClick={() => {
                    setHomeScorePending(pts);
                    setSelectedPlayer(null);
                    setShowAssistBar(false);
                  }}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white active:scale-95 transition-all disabled:opacity-40 ${
                    homeScorePending === pts
                      ? "bg-green-600 ring-2 ring-green-400"
                      : "bg-green-800/60 hover:bg-green-700/70"
                  }`}>
                  +{pts}
                </button>
              ))}
            </div>
          </section>

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
              <Label>5 inicial (seleciona até 5)</Label>
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

      {/* ── DIALOG: 5 em Campo ────────────────── */}
      <Dialog open={lineupDialog} onOpenChange={setLineupDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🏀 5 em Campo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Seleciona os jogadores atualmente em campo ({lineupSel.length}/5)
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
              {roster.map((p) => (
                <button key={p.user_id}
                  onClick={() => setLineupSel((prev) =>
                    prev.includes(p.user_id)
                      ? prev.filter((id) => id !== p.user_id)
                      : prev.length < 5 ? [...prev, p.user_id] : prev
                  )}
                  className={`text-xs rounded-md px-2.5 py-1.5 border transition-all ${
                    lineupSel.includes(p.user_id)
                      ? "bg-cdpovoa-blue text-white border-cdpovoa-blue font-bold"
                      : "border-border hover:border-cdpovoa-blue"
                  }`}>
                  #{p.jersey_number} {p.user.name.split(" ")[0]}
                </button>
              ))}
              {roster.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  Não existem jogadores convocados para este jogo.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineupDialog(false)}>Cancelar</Button>
            <Button
              disabled={recording || lineupSel.length === 0}
              onClick={async () => {
                const ok = await setLineup(lineupSel);
                if (ok) setLineupDialog(false);
              }}>
              Confirmar ({lineupSel.length}/5)
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
